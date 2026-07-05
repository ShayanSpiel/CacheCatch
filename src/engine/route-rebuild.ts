import type { NormalizedTrace, RouteAudit, RoutePromptRebuild } from "../types/index.ts"
import { approximateTokens } from "./tokens.ts"
import { comparePrompts } from "./prefix-matcher.ts"
import type { ModelPrice } from "./pricing.ts"

type ExampleDiff = NonNullable<RoutePromptRebuild["exampleDiff"]>

interface BuildRouteRebuildArgs {
  route: RouteAudit
  traces: NormalizedTrace[]
  modelPrice?: ModelPrice
  financialMode: boolean
  recoverableDeltaPerMillion?: number
  /** Monthly projection factor derived from the report window (e.g. 30/7 for 7d). */
  monthlyProjectionFactor: number
}

/**
 * Names the "type" of dynamic field detected at the divergence
 * position. Mirrors the labels in `detectors.ts:detectors.ts:35-72`
 * so we don't have to re-run the regexes here.
 */
function labelForField(rawMatch: string, route: RouteAudit): { name: string; kind: "metadata" | "timestamp" | "request_id" | "rag" | "tool" | "system" | "other" } {
  if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(rawMatch)) return { name: rawMatch, kind: "timestamp" }
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(rawMatch)) {
    return { name: rawMatch, kind: "request_id" }
  }
  if (/(?:req|request|rq|ref|ticket|session|sess)[-_]?[a-z0-9]{6,}/i.test(rawMatch)) {
    return { name: rawMatch, kind: "request_id" }
  }
  if (/\b(?:user|project|thread|session|customer|account|tenant|request|trace|job|task|order|conversation|run|message)[-_]?id\b/i.test(rawMatch)) {
    return { name: rawMatch, kind: "metadata" }
  }
  if (/\b[a-z_][a-z0-9_]*[_]?id\b\s*[:=]/i.test(rawMatch)) {
    return { name: rawMatch, kind: "metadata" }
  }
  if (/retriev|search_/i.test(rawMatch) || route.findings.some((f) => f.type === "rag_before_stable_context")) {
    return { name: rawMatch, kind: "rag" }
  }
  if (/function|tool|def\s/i.test(rawMatch) || route.findings.some((f) => f.type === "tool_schema_drift")) {
    return { name: rawMatch, kind: "tool" }
  }
  if (route.findings.some((f) => f.type === "dynamic_system_prompt")) {
    return { name: rawMatch, kind: "system" }
  }
  return { name: rawMatch, kind: "other" }
}

function stableHeaderForRoute(route: RouteAudit): string[] {
  const out: string[] = ["## System role and constraints"]
  if (route.findings.some((f) => f.type === "tool_schema_drift")) {
    out.push("## Tool definitions (sorted, versioned, byte-stable)")
  } else {
    out.push("## Tool definitions")
  }
  out.push("## Policy and rules")
  out.push("## Static few-shot examples")
  return out
}

function exampleDiffFromTraces(traces: NormalizedTrace[]): ExampleDiff | null {
  const samples = traces
    .filter((t) => t.promptText && t.promptText.length > 0)
    .slice(0, 8)
  if (samples.length < 2) return null
  const stats = comparePrompts(samples.map((t) => t.promptText!))
  if (!stats || stats.firstDivergenceChar >= samples[0].promptText.length - 1) return null
  const char = Math.min(stats.firstDivergenceChar, samples[0].promptText.length - 1)
  const sliceFrom = samples[0].promptText.slice(Math.max(0, char - 24), char + 64)
  // Pick the first sample that actually differs at the divergence point.
  const other = samples.find((s) => s.promptText !== samples[0].promptText)
  if (!other) return null
  const sliceTo = other.promptText.slice(Math.max(0, char - 24), char + 64)
  return {
    from: { traceId: samples[0].traceId, char, slice: sliceFrom },
    to: { traceId: other.traceId, char, slice: sliceTo },
  }
}

/**
 * Clamp the post-fix expected rate into [observed, 0.95]. The 0.95
 * ceiling reflects what well-tuned prompt assembly can realistically
 * achieve — the asymptote is never 100% because tool outputs and
 * RAG churn are part of the dynamic tail by design.
 */
function expectedRateAfterFix(observed: number | null): number {
  if (observed === null) return 0.7
  const min = Math.min(0.95, Math.max(observed, observed + 0.2))
  return Math.max(0, Math.min(0.95, min))
}

export function buildRouteRebuild(args: BuildRouteRebuildArgs): RoutePromptRebuild {
  const { route, traces, modelPrice, financialMode, recoverableDeltaPerMillion, monthlyProjectionFactor } = args

  const fieldsToMoveDown: RoutePromptRebuild["fieldsToMoveDown"] = []
  for (const finding of route.findings) {
    const evidence = finding.evidence
    // Match either single-quoted, double-quoted, or backtick-wrapped fields.
    const match =
      evidence.match(/'([^']+)'/)?.[1] ??
      evidence.match(/"([^"]+)"/)?.[1] ??
      evidence.match(/`([^`]+)`/)?.[1]
    const char = finding.firstDivergenceChar ?? 0
    if (match && match.length > 1 && match.length < 200) {
      fieldsToMoveDown.push({
        name: labelForField(match, route).name,
        currentChar: char,
        firstSeen: match.length > 64 ? `${match.slice(0, 60)}…` : match,
      })
    } else {
      // No raw match — still record the breaker, so the advice generator can name the section.
      fieldsToMoveDown.push({
        name: finding.title,
        currentChar: char,
        firstSeen: finding.title,
      })
    }
  }

  const fieldsToSort: RoutePromptRebuild["fieldsToSort"] = []
  if (route.findings.some((f) => f.type === "tool_schema_drift")) {
    fieldsToSort.push({
      kind: "tool_schema",
      reason: "Tool definitions are not byte-stable across traces; sort alphabetically and pin to a versioned schema hash.",
    })
  }
  if (route.findings.some((f) => f.type === "dynamic_system_prompt")) {
    fieldsToSort.push({
      kind: "examples",
      reason: "System-prompt start varies across traces; lock the prompt template to a deployment tag.",
    })
  }

  const stablePrefixTokens = Math.max(0, route.avgInputTokens - route.avgFirstDivergenceToken)
  const reusableTokensAfterFix = stablePrefixTokens

  const expectedCacheReadRateAfterFix = expectedRateAfterFix(route.observedCacheReadRate)

  let expectedMonthlySavingsUsd: number | null = null
  if (financialMode && recoverableDeltaPerMillion !== undefined) {
    const tokensSaved = route.estimatedCacheOpportunityTokens * monthlyProjectionFactor
    expectedMonthlySavingsUsd = (tokensSaved * recoverableDeltaPerMillion) / 1_000_000
  }

  return {
    route: route.route,
    model: route.model,
    stableHeader: stableHeaderForRoute(route),
    fieldsToMoveDown,
    fieldsToSort,
    exampleDiff: exampleDiffFromTraces(traces),
    reusableTokensAfterFix,
    expectedCacheReadRateAfterFix,
    expectedMonthlySavingsUsd,
    cacheContractNote: modelPrice?.cacheContract?.rule ?? null,
  }
}

/** Approximate how many tokens the rebuild would make reusable. */
export function tokensSavedByRebuild(route: RouteAudit): number {
  return Math.max(0, route.avgInputTokens - route.avgFirstDivergenceToken)
}

/** Re-export approximateTokens so this file is the single import path for the rebuild module. */
export { approximateTokens }

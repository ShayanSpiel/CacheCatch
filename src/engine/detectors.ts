import type {
  CacheBreakerType,
  CacheFinding,
  FindingBasis,
  NormalizedTrace,
  RouteAudit,
} from "../types/index.ts"
import { approximateTokens } from "./tokens.ts"
import {
  CACHE_BREAKER_LABELS,
  CACHE_BREAKER_SEVERITY,
  DEFAULT_PRICE_PER_1K_TOKENS_USD,
  SEVERITY_RANK,
} from "./constants.ts"
import { comparePrompts } from "./prefix-matcher.ts"

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const TIMESTAMP_PATTERN = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g
const REQUEST_ID_PATTERNS = [
  /(?:req|request|rq|ref|ticket)[-_]?[a-z0-9]{6,}/gi,
  /RFD[-_]\d{4,}/g,
  /(?:session|sess)[-_]?[a-z0-9]{6,}/gi,
]
const NAMED_ID_PATTERN =
  /\b(?:user|project|thread|session|customer|account|tenant|request|trace|job|task|order|conversation|run|message)[-_]?id\s*[:=]\s*["']?[a-zA-Z0-9_-]{4,}/gi
const GENERIC_ID_KV_PATTERN =
  /["']?\b[a-z_][a-z0-9_]*[_]?id["']?\s*[:=]\s*["']?[a-zA-Z0-9_-]{4,}/gi

interface DetectedPattern {
  type: CacheBreakerType
  position: number
  match: string
}

function detectPatterns(promptText: string): DetectedPattern[] {
  const results: DetectedPattern[] = []

  const uuidMatch = promptText.match(UUID_PATTERN)
  if (uuidMatch) {
    const idx = promptText.indexOf(uuidMatch[0])
    results.push({ type: "request_id_in_prefix", position: idx, match: uuidMatch[0] })
  }

  const tsMatch = promptText.match(TIMESTAMP_PATTERN)
  if (tsMatch) {
    const idx = promptText.indexOf(tsMatch[0])
    results.push({ type: "timestamp_in_prefix", position: idx, match: tsMatch[0] })
  }

  for (const pattern of REQUEST_ID_PATTERNS) {
    const match = promptText.match(pattern)
    if (match) {
      const idx = promptText.indexOf(match[0])
      results.push({ type: "request_id_in_prefix", position: idx, match: match[0] })
      break
    }
  }

  const namedIdMatch = promptText.match(NAMED_ID_PATTERN)
  if (namedIdMatch) {
    const idx = promptText.indexOf(namedIdMatch[0])
    results.push({ type: "early_dynamic_metadata", position: idx, match: namedIdMatch[0] })
  } else {
    const genericIdMatch = promptText.match(GENERIC_ID_KV_PATTERN)
    if (genericIdMatch) {
      const idx = promptText.indexOf(genericIdMatch[0])
      results.push({ type: "early_dynamic_metadata", position: idx, match: genericIdMatch[0] })
    }
  }

  return results
}

function findFirstDiffPos(a: string, b: string): number {
  const minLen = Math.min(a.length, b.length)
  for (let i = 0; i < minLen; i++) {
    if (a[i] !== b[i]) return i
  }
  return minLen
}

function getRecommendation(type: CacheBreakerType): string {
  const recommendations: Record<CacheBreakerType, string> = {
    early_dynamic_metadata:
      "Move all dynamic metadata (user IDs, session info) after the stable system prompt and tool definitions.",
    timestamp_in_prefix:
      "Replace absolute timestamps with relative offsets or omit them from the prompt prefix entirely.",
    request_id_in_prefix:
      "Move request identifiers to the dynamic section after all stable instructions.",
    tool_schema_drift:
      "Freeze tool schemas during deployment windows. Version tool definitions explicitly.",
    rag_before_stable_context:
      "Place all retrieval output in the dynamic tail. Keep rules and constraints in the stable prefix.",
    dynamic_system_prompt:
      "Pin system prompt template across deployments. Use deployment tags instead of in-prompt version strings.",
    model_or_provider_drift:
      "Consolidate to a single model/provider per route for consistent caching behavior.",
    missing_cache_telemetry:
      "Enable cached token tracking to directly measure prefix cache efficiency.",
    observed_cache_read_low:
      "Inspect prompt assembly and move volatile metadata after stable system/tools/policy blocks.",
    estimated_cache_opportunity_high:
      "Move dynamic request metadata to the tail so the stable prefix can be reused.",
    unknown: "Review prompt template for dynamic content that may break the cache prefix.",
  }
  return recommendations[type] || recommendations.unknown
}

export function detectFindings(traces: NormalizedTrace[]): CacheFinding[] {
  const findings: CacheFinding[] = []
  const routeGroups = new Map<string, NormalizedTrace[]>()

  for (const trace of traces) {
    const existing = routeGroups.get(trace.route) || []
    existing.push(trace)
    routeGroups.set(trace.route, existing)
  }

  for (const [route, routeTraces] of routeGroups) {
    if (routeTraces.length < 1) continue

    const sample = routeTraces[0]
    const promptText = sample.promptText
    if (!promptText) continue

    const detected = detectPatterns(promptText)
    const matches = new Map<
      CacheBreakerType,
      { type: CacheBreakerType; position: number; evidence: string; basis: FindingBasis }
    >()

    for (const d of detected) {
      if (!matches.has(d.type)) {
        matches.set(d.type, {
          type: d.type,
          position: d.position,
          evidence: `Trace #${sample.traceId}: '${d.match}' found at character position ${d.position}.`,
          basis: "estimated",
        })
      }
    }

    const firstDynamicPosition = Math.min(
      ...Array.from(matches.values()).map((m) => m.position),
      promptText.length
    )

    const hasRagBeforeStable =
      promptText.toLowerCase().includes("retriev") &&
      !promptText.includes("---") &&
      !promptText.includes("\n===\n") &&
      firstDynamicPosition < approximateTokens(promptText) * 0.3

    if (hasRagBeforeStable) {
      matches.set("rag_before_stable_context", {
        type: "rag_before_stable_context",
        position: firstDynamicPosition,
        evidence: `Retrieved content appears before stable instructions separator. First dynamic content at character ${firstDynamicPosition}.`,
        basis: "estimated",
      })
    }

    const allPromptTexts = routeTraces
      .map((t) => t.promptText || "")
      .filter(Boolean)
    if (allPromptTexts.length >= 2) {
      const firstFew = allPromptTexts[0].slice(0, 200)
      const secondFew = allPromptTexts[1].slice(0, 200)
      if (firstFew !== secondFew) {
        const diffPos = findFirstDiffPos(firstFew, secondFew)
        const isToolDrift =
          allPromptTexts[0].includes("function") ||
          allPromptTexts[0].includes("tool") ||
          allPromptTexts[0].includes("def ")

        if (isToolDrift && diffPos < 500) {
          matches.set("tool_schema_drift", {
            type: "tool_schema_drift",
            position: diffPos,
            evidence: `Consecutive traces show differing tool/function definitions at character position ${diffPos}.`,
            basis: "estimated",
          })
        }
      }
    }

    const modelVariations = new Set(
      routeTraces.map((t) => `${t.provider}:${t.model}`)
    )
    if (modelVariations.size > 1) {
      matches.set("model_or_provider_drift", {
        type: "model_or_provider_drift",
        position: 0,
        evidence: `Route uses ${modelVariations.size} different model/provider combinations: ${Array.from(modelVariations).join(", ")}.`,
        basis: "observed",
      })
    }

    const hasCacheTelemetry = routeTraces.some(
      (t) => (t.metrics.cacheReadTokens ?? 0) > 0
    )
    if (!hasCacheTelemetry) {
      matches.set("missing_cache_telemetry", {
        type: "missing_cache_telemetry",
        position: 0,
        evidence:
          "No trace in this route reports cache-read tokens. Cache hit rate cannot be directly measured.",
        basis: "data_quality",
      })
    }

    if (hasCacheTelemetry) {
      const totalInput = routeTraces.reduce(
        (s, t) => s + (t.metrics.totalInputTokens || 0),
        0
      )
      const totalCacheRead = routeTraces.reduce(
        (s, t) => s + (t.metrics.cacheReadTokens || 0),
        0
      )
      if (totalInput > 0) {
        const rate = totalCacheRead / totalInput
        if (rate < 0.1) {
          matches.set("observed_cache_read_low", {
            type: "observed_cache_read_low",
            position: 0,
            evidence: `Provider reported only ${(rate * 100).toFixed(1)}% cache-read tokens across this route.`,
            basis: "observed",
          })
        }
      }
    }

    const avgInputTokens =
      routeTraces.reduce(
        (sum, t) => sum + (t.metrics.totalInputTokens || approximateTokens(t.promptText)),
        0
      ) / routeTraces.length
    const firstDivPos =
      matches.size > 0
        ? Math.min(...Array.from(matches.values()).map((m) => m.position))
        : promptText.length
    const firstDivToken = Math.max(1, approximateTokens(firstDivPos))
    const stableAfterDiv = Math.max(0, avgInputTokens - firstDivToken)
    if (stableAfterDiv > 2000) {
      matches.set("estimated_cache_opportunity_high", {
        type: "estimated_cache_opportunity_high",
        position: firstDivPos,
        evidence: `Cachecatch found ~${Math.round(stableAfterDiv).toLocaleString()} stable tokens after the first divergence point.`,
        basis: "estimated",
      })
    }

    const systemPromptVariations = new Set(
      routeTraces.map((t) => (t.promptText || "").slice(0, 100))
    )
    if (systemPromptVariations.size > 2) {
      matches.set("dynamic_system_prompt", {
        type: "dynamic_system_prompt",
        position: 0,
        evidence: `System prompt start differs across ${systemPromptVariations.size} variants in this route.`,
        basis: "estimated",
      })
    }

    for (const [, match] of matches) {
      const severity = CACHE_BREAKER_SEVERITY[match.type] || "low"
      const firstDivergenceToken = Math.max(1, approximateTokens(match.position))
      const estInputTokens =
        routeTraces.reduce(
          (sum, t) => sum + (t.metrics.totalInputTokens || approximateTokens(t.promptText)),
          0
        ) / routeTraces.length
      const estimatedLostTokens = Math.max(0, estInputTokens - firstDivergenceToken)
      const estimatedMonthlyWasteUsd = Math.round(
        (estimatedLostTokens / (estInputTokens || 1)) *
          routeTraces.length *
          DEFAULT_PRICE_PER_1K_TOKENS_USD *
          30
      )

      findings.push({
        id: `finding-${route}-${match.type}`,
        type: match.type,
        severity,
        title: CACHE_BREAKER_LABELS[match.type] || match.type,
        route,
        evidence: match.evidence,
        basis: match.basis,
        firstDivergenceToken,
        firstDivergenceChar: match.position,
        estimatedLostTokens,
        estimatedMonthlyWasteUsd,
        recommendation: getRecommendation(match.type),
      })
    }
  }

  return findings.sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 99) - (SEVERITY_RANK[b.severity] ?? 99)
  )
}

/** Build per-route audit summaries from a batch of traces. */
export function buildRouteAudits(
  traces: NormalizedTrace[],
  findings: CacheFinding[]
): RouteAudit[] {
  const routeGroups = new Map<string, NormalizedTrace[]>()
  for (const t of traces) {
    const existing = routeGroups.get(t.route) || []
    existing.push(t)
    routeGroups.set(t.route, existing)
  }

  const routeAudits: RouteAudit[] = []

  for (const [route, routeTraces] of routeGroups) {
    const routeFindings = findings.filter((f) => f.route === route)

    const observedInputTokens = routeTraces.reduce(
      (sum, t) => sum + (t.metrics.totalInputTokens || 0),
      0
    )
    const observedCacheReadTokens = routeTraces.reduce(
      (sum, t) => sum + (t.metrics.cacheReadTokens || 0),
      0
    )
    const observedCacheCreationTokens = routeTraces.reduce(
      (sum, t) => sum + (t.metrics.cacheCreationTokens || 0),
      0
    )

    const observedCacheReadRate: number | null =
      observedInputTokens > 0 && observedCacheReadTokens > 0
        ? observedCacheReadTokens / observedInputTokens
        : null

    const prompts = routeTraces.map((t) => t.promptText).filter(Boolean)
    const prefixStats = prompts.length >= 2 ? comparePrompts(prompts) : null

    const firstDivergenceToken = prefixStats
      ? prefixStats.firstDivergenceToken
      : Math.round(
          observedInputTokens > 0
            ? observedInputTokens / routeTraces.length
            : 4000
        )
    const firstDivergenceChar = prefixStats?.firstDivergenceChar

    const estimatedInputTokens = routeTraces.reduce(
      (sum, t) => sum + (t.metrics.totalInputTokens || approximateTokens(t.promptText)),
      0
    )
    const avgInputTokens =
      routeTraces.length > 0
        ? Math.round(
            observedInputTokens > 0
              ? observedInputTokens / routeTraces.length
              : estimatedInputTokens / routeTraces.length
          )
        : 0

    const stableTokensAfterDivergence = Math.max(0, avgInputTokens - firstDivergenceToken)
    const estimatedCacheOpportunityTokens = stableTokensAfterDivergence * routeTraces.length
    const estimatedReusableTokensAfterDivergence = stableTokensAfterDivergence

    const estimatedMonthlyWasteUsd = Math.round(
      routeFindings.reduce((sum, f) => sum + (f.estimatedMonthlyWasteUsd || 0), 0)
    )

    const model = routeTraces.map((t) => t.model).filter(Boolean).find(Boolean) || undefined
    const provider = routeTraces.map((t) => t.provider).filter(Boolean).find(Boolean) || undefined

    routeAudits.push({
      route,
      model,
      provider,
      runsAnalyzed: routeTraces.length,
      observedInputTokens,
      observedCacheReadTokens,
      observedCacheCreationTokens,
      observedCacheReadRate,
      estimatedReusableTokensAfterDivergence,
      estimatedCacheOpportunityTokens,
      estimatedMonthlyWasteUsd:
        estimatedMonthlyWasteUsd > 0
          ? estimatedMonthlyWasteUsd
          : Math.round((estimatedCacheOpportunityTokens * 0.003 * 30) / 1000),
      avgInputTokens,
      avgFirstDivergenceToken: firstDivergenceToken,
      avgFirstDivergenceChar: firstDivergenceChar,
      findings: routeFindings,
    })
  }

  return routeAudits.sort((a, b) => b.estimatedMonthlyWasteUsd - a.estimatedMonthlyWasteUsd)
}

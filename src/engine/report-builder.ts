import type {
  AuditWindow,
  CachecatchReport,
  CacheFinding,
  Confidence,
  NormalizedTrace,
  Provider,
  RecommendedLayout,
  ReportMode,
} from "../types/index.ts"
import { buildRouteAudits, detectFindings } from "./detectors.ts"
import {
  assessDataQuality,
  calculateDiagnosisConfidence,
  calculateMoneyConfidence,
  calculateReportConfidence,
  calculateScore,
  telemetryQuality,
} from "./scoring.ts"
import { DEFAULT_PRICE_PER_1K_TOKENS_USD } from "./constants.ts"

interface ModelPricing {
  inputUsdPerMillion: number
  cachedInputUsdPerMillion?: number
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-4o": { inputUsdPerMillion: 2.5, cachedInputUsdPerMillion: 1.25 },
  "gpt-4o-mini": { inputUsdPerMillion: 0.15, cachedInputUsdPerMillion: 0.075 },
}

function generateId(): string {
  return `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function generateFixPlan(findings: CacheFinding[]): string[] {
  const fixSet = new Set<string>()
  for (const f of findings) fixSet.add(f.recommendation)
  return Array.from(fixSet)
}

function generateRecommendedLayout(findings: CacheFinding[]): RecommendedLayout {
  const hasRag = findings.some((f) => f.type === "rag_before_stable_context")
  const hasMetadata = findings.some(
    (f) =>
      f.type === "early_dynamic_metadata" ||
      f.type === "timestamp_in_prefix" ||
      f.type === "request_id_in_prefix"
  )
  const hasToolDrift = findings.some((f) => f.type === "tool_schema_drift")

  const stablePrefix: string[] = ["[system role and constraints]"]
  if (hasToolDrift) {
    stablePrefix.push("[static tool definitions — sorted, versioned]")
  } else {
    stablePrefix.push("[tool definitions]")
  }
  stablePrefix.push("[policy and rules]")
  stablePrefix.push("[static few-shot examples]")

  const dynamicTail: string[] = []
  if (hasMetadata) {
    dynamicTail.push("[request_id / session_id]")
    dynamicTail.push("[timestamp — relative offset preferred]")
    dynamicTail.push("[user metadata]")
  }
  if (hasRag) {
    dynamicTail.push("[RAG context / retrieved documents]")
  }
  dynamicTail.push("[user query]")
  dynamicTail.push("[tool outputs]")

  return { stablePrefix, dynamicTail }
}

export interface BuildReportOptions {
  projectName: string
  projectUrl?: string
  window: AuditWindow
  source: Provider
  id?: string
  createdAt?: string
}

function monthlyProjectionFactor(window: AuditWindow): number {
  switch (window) {
    case "24h":
      return 30
    case "7d":
      return 30 / 7
    case "30d":
      return 1
    case "1y":
      return 30 / 365
  }
}

function windowDays(window: AuditWindow): number {
  switch (window) {
    case "24h":
      return 1
    case "7d":
      return 7
    case "30d":
      return 30
    case "1y":
      return 365
  }
}

function telemetryDocsUrl(source: Provider): string | undefined {
  switch (source) {
    case "langsmith":
      return "https://docs.smith.langchain.com/observability"
    case "langfuse":
      return "https://langfuse.com/docs/observability/features/token-and-cost-tracking"
    case "braintrust":
      return "https://www.braintrust.dev/docs/guides/traces/logs"
    default:
      return undefined
  }
}

function normalizeModelName(model: string | undefined): string {
  return (model ?? "").trim().toLowerCase()
}

function pricingForModel(model: string | undefined): ModelPricing | undefined {
  return MODEL_PRICING[normalizeModelName(model)]
}

function pricingConfidenceFor(traces: NormalizedTrace[]): {
  confidence: Confidence
  basis: string
  uncachedInputUsdPerMillion?: number
  cachedReadUsdPerMillion?: number
} {
  const models = Array.from(new Set(traces.map((trace) => normalizeModelName(trace.model)).filter((model) => model && model !== "unknown")))
  if (models.length === 0) {
    return { confidence: "low", basis: "model metadata missing or unknown; pricing was not applied" }
  }

  const priced = models.map((model) => ({ model, pricing: pricingForModel(model) }))
  const missing = priced.filter((entry) => !entry.pricing)
  if (missing.length > 0) {
    return {
      confidence: "low",
      basis: `pricing unknown for ${missing.map((entry) => entry.model).join(", ")}; no fallback price was applied`,
    }
  }

  const missingCached = priced.filter((entry) => entry.pricing?.cachedInputUsdPerMillion === undefined)
  if (missingCached.length > 0) {
    return {
      confidence: "medium",
      basis: `uncached input pricing known, cached-input pricing missing for ${missingCached.map((entry) => entry.model).join(", ")}; precise cache savings disabled`,
    }
  }

  const tokenByModel = new Map<string, number>()
  for (const trace of traces) {
    const model = normalizeModelName(trace.model)
    if (!model || model === "unknown") continue
    tokenByModel.set(model, (tokenByModel.get(model) ?? 0) + (trace.metrics.totalInputTokens || 0))
  }
  const denominator = Array.from(tokenByModel.values()).reduce((sum, tokens) => sum + tokens, 0)
  const weighted = (field: keyof ModelPricing): number => {
    if (denominator <= 0) {
      const values = priced.map((entry) => entry.pricing?.[field] ?? 0)
      return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
    }
    return priced.reduce((sum, entry) => {
      const tokens = tokenByModel.get(entry.model) ?? 0
      return sum + ((entry.pricing?.[field] ?? 0) * tokens) / denominator
    }, 0)
  }

  return {
    confidence: "high",
    basis: `exact built-in pricing matched for ${models.join(", ")}`,
    uncachedInputUsdPerMillion: weighted("inputUsdPerMillion"),
    cachedReadUsdPerMillion: weighted("cachedInputUsdPerMillion"),
  }
}

/**
 * The single entry point of the engine. Given a batch of
 * `NormalizedTrace[]`, produce a `CachecatchReport`.
 *
 * This function is the public contract between adapters and reporting.
 * It must remain pure and provider-agnostic.
 */
export function buildReport(
  traces: NormalizedTrace[],
  options: BuildReportOptions
): CachecatchReport {
  const findings = detectFindings(traces)
  let routes = buildRouteAudits(traces, findings)

  const totalRunsAnalyzed = traces.length
  const totalRoutesAnalyzed = routes.length

  const observedInputTokens = routes.reduce((sum, r) => sum + r.observedInputTokens, 0)
  const observedOutputTokens = traces.reduce(
    (sum, t) => sum + (t.metrics.totalOutputTokens || 0),
    0
  )
  const observedCacheReadTokens = routes.reduce(
    (sum, r) => sum + r.observedCacheReadTokens,
    0
  )
  const observedCacheCreationTokens = routes.reduce(
    (sum, r) => sum + r.observedCacheCreationTokens,
    0
  )

  const observedCacheReadRate: number | null =
    observedInputTokens > 0 && observedCacheReadTokens > 0
      ? observedCacheReadTokens / observedInputTokens
      : null

  const windowMissedReusableTokens = routes.reduce(
    (sum, r) => sum + r.estimatedCacheOpportunityTokens,
    0
  )
  const estimatedReusableTokensAfterDivergence = routes.reduce(
    (sum, r) => sum + r.estimatedReusableTokensAfterDivergence,
    0
  )
  const projectionFactor = monthlyProjectionFactor(options.window)
  const projectedMonthlyRuns = Math.round(totalRunsAnalyzed * projectionFactor)
  const projectedMonthlyMissedReusableTokens = Math.round(
    windowMissedReusableTokens * projectionFactor
  )
  const pricing = pricingConfidenceFor(traces)
  const blendedUncachedInputCostPerMillion = pricing.uncachedInputUsdPerMillion
  const blendedCachedReadCostPerMillion = pricing.cachedReadUsdPerMillion
  const recoverableDeltaPerMillion =
    blendedUncachedInputCostPerMillion !== undefined &&
    blendedCachedReadCostPerMillion !== undefined
      ? blendedUncachedInputCostPerMillion - blendedCachedReadCostPerMillion
      : undefined
  const monthlyRecoverableCacheLossPrecise =
    recoverableDeltaPerMillion !== undefined
      ? (projectedMonthlyMissedReusableTokens * recoverableDeltaPerMillion) / 1_000_000
      : undefined

  const topBreaker =
    findings.length > 0 ? findings[0].title : "No significant cache breakers detected."

  const hasRenderedPrompts = traces.some((t) => t.promptText && t.promptText.length > 0)
  const hasTokenUsage = traces.some(
    (t) => (t.metrics.totalInputTokens ?? 0) > 0 || (t.metrics.totalOutputTokens ?? 0) > 0
  )
  const hasCacheReadTelemetry = traces.some((t) => (t.metrics.cacheReadTokens ?? 0) > 0)
  const hasCacheCreationTelemetry = traces.some(
    (t) => (t.metrics.cacheCreationTokens ?? 0) > 0
  )
  const hasProviderMetadata = traces.some((t) => !!t.provider)
  const hasModelMetadata = traces.some((t) => !!t.model)

  const dataQuality = assessDataQuality(totalRunsAnalyzed, routes, {
    hasRenderedPrompts,
    hasTokenUsage,
    hasCacheReadTelemetry,
    hasCacheCreationTelemetry,
    hasProviderMetadata,
    hasModelMetadata,
  })

  const score = calculateScore({
    summary: { observedCacheReadRate },
    findings,
    routes,
    dataQuality,
  })

  const confidence = calculateReportConfidence(dataQuality)
  const diagnosisConfidence = calculateDiagnosisConfidence(dataQuality)
  const baseMoneyConfidence = calculateMoneyConfidence(dataQuality)
  const financialMode =
    dataQuality.hasTokenUsage &&
    dataQuality.hasCacheReadTelemetry &&
    pricing.confidence === "high" &&
    recoverableDeltaPerMillion !== undefined
  const reportMode: ReportMode = financialMode ? "financial_cache_audit" : "prefix_diagnostic"
  const moneyConfidence: Confidence = financialMode
    ? baseMoneyConfidence
    : pricing.confidence === "medium" && dataQuality.hasTokenUsage && dataQuality.hasCacheReadTelemetry
      ? "medium"
      : "low"
  const estimatedMonthlyWasteUsd =
    financialMode && monthlyRecoverableCacheLossPrecise !== undefined
      ? Math.round(monthlyRecoverableCacheLossPrecise)
      : 0
  if (financialMode && recoverableDeltaPerMillion !== undefined) {
    const preciseRouteLosses = routes.map((route) => ({
      route,
      precise:
        (route.estimatedCacheOpportunityTokens * projectionFactor * recoverableDeltaPerMillion) /
        1_000_000,
    }))
    const roundedRouteLosses = preciseRouteLosses.map(({ precise }) => Math.round(precise))
    const roundedRouteTotal = roundedRouteLosses.reduce((sum, loss) => sum + loss, 0)
    const routeRoundingDelta = estimatedMonthlyWasteUsd - roundedRouteTotal
    routes = preciseRouteLosses.map(({ route }, index) => ({
      ...route,
      estimatedMonthlyWasteUsd:
        roundedRouteLosses[index] + (index === 0 ? routeRoundingDelta : 0),
    }))
  } else {
    routes = routes.map((route) => ({ ...route, estimatedMonthlyWasteUsd: 0 }))
  }
  const quality = telemetryQuality(dataQuality)
  const confidenceReason = [
    dataQuality.hasRenderedPrompts ? "rendered prompts available" : "rendered prompts missing",
    dataQuality.hasTokenUsage ? "token usage available" : "token usage missing",
    dataQuality.hasCacheReadTelemetry
      ? "cached-token telemetry available"
      : "cached-token telemetry missing",
  ].join(", ")
  const estimateLabel = financialMode
    ? "Estimated recoverable cache loss"
    : dataQuality.hasRenderedPrompts
      ? "Prefix-drift estimate"
      : "Directional token estimate"
  const savingsAccuracyNote = financialMode
    ? "Savings math uses observed input-token volume, observed cache-read telemetry, exact matched model pricing, the displayed monthly projection, and the displayed uncached-vs-cached input price delta. The remaining uncertainty is future traffic and route/model mix."
    : "Money estimate unavailable / low confidence. Prompt structure issue detected. Enable token usage, cached-token telemetry, and known model pricing to calculate finance-grade savings."

  return {
    id: options.id ?? generateId(),
    createdAt: options.createdAt ?? new Date().toISOString(),
    source: options.source,
    projectName: options.projectName,
    projectUrl: options.projectUrl,
    window: options.window,
    score,
    confidence,
    summary: {
      runsAnalyzed: totalRunsAnalyzed,
      routesAnalyzed: totalRoutesAnalyzed,
      observedCacheReadTokens,
      observedCacheCreationTokens,
      observedInputTokens,
      observedOutputTokens,
      observedCacheReadRate,
      estimatedReusableTokensAfterDivergence,
      estimatedCacheOpportunityTokens: projectedMonthlyMissedReusableTokens,
      estimatedMonthlyWasteUsd,
      topBreaker,
    },
    routes,
    findings,
    recommendedLayout: generateRecommendedLayout(findings),
    fixPlan: generateFixPlan(findings),
    dataQuality,
    details: {
      reportMode,
      diagnosisConfidence,
      moneyConfidence,
      pricingConfidence: pricing.confidence,
      telemetryQuality: quality,
      confidenceReason,
      estimateLabel,
      projectedMonthlyRuns,
      projectionFormula: `${totalRunsAnalyzed.toLocaleString("en-US")} * 30 / ${windowDays(options.window)} = ${projectedMonthlyRuns.toLocaleString("en-US")}`,
      missedReusableTokensPerRun:
        totalRunsAnalyzed > 0 ? Math.round(windowMissedReusableTokens / totalRunsAnalyzed) : 0,
      windowMissedReusableTokens,
      windowMissedReusableTokensFormula:
        totalRunsAnalyzed > 0
          ? `${totalRunsAnalyzed.toLocaleString("en-US")} * ${Math.round(windowMissedReusableTokens / totalRunsAnalyzed).toLocaleString("en-US")} = ${windowMissedReusableTokens.toLocaleString("en-US")}`
          : undefined,
      projectedMonthlyMissedReusableTokens,
      monthlyMissedReusableTokensFormula: `${windowMissedReusableTokens.toLocaleString("en-US")} * 30 / ${windowDays(options.window)} = ${projectedMonthlyMissedReusableTokens.toLocaleString("en-US")}`,
      blendedUncachedInputCostPerMillion,
      blendedCachedReadCostPerMillion,
      recoverableDeltaPerMillion,
      monthlyRecoverableCacheLossPrecise,
      pricingBasis: pricing.basis,
      monthlyRecoverableCacheLossFormula:
        recoverableDeltaPerMillion !== undefined && monthlyRecoverableCacheLossPrecise !== undefined
          ? `${(projectedMonthlyMissedReusableTokens / 1_000_000).toFixed(1)}M * $${recoverableDeltaPerMillion.toFixed(2)} / 1M = $${monthlyRecoverableCacheLossPrecise.toFixed(2)}`
          : undefined,
      credibilityReason: confidenceReason,
      savingsAccuracyNote,
      telemetryDocsUrl: telemetryDocsUrl(options.source),
    },
  }
}

/** Convert a CachecatchReport into a list of plain NormalizedTrace
 *  with `estimatedWasteUsd` filled in per-trace from the report's
 *  aggregate average. */
export function annotateWaste(
  traces: NormalizedTrace[],
  report: CachecatchReport
): NormalizedTrace[] {
  if (traces.length === 0) return traces
  const perTrace = report.summary.estimatedMonthlyWasteUsd / traces.length
  return traces.map((t) => ({
    ...t,
    metrics: {
      ...t.metrics,
      estimatedWasteUsd: perTrace,
    },
  }))
}

/** Re-export the price constant so consumers can override it. */
export { DEFAULT_PRICE_PER_1K_TOKENS_USD }

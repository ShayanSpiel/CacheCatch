import type {
  CacheFinding,
  Confidence,
  DataQuality,
  RouteAudit,
} from "../types/index.ts"

export function assessDataQuality(
  runsAnalyzed: number,
  routes: RouteAudit[],
  flags: {
    hasRenderedPrompts: boolean
    hasTokenUsage: boolean
    hasCacheReadTelemetry: boolean
    hasCacheCreationTelemetry: boolean
    hasProviderMetadata: boolean
    hasModelMetadata: boolean
  }
): DataQuality {
  const warnings: string[] = []
  const confidenceReasons: string[] = []
  const comparableRunGroups = routes.filter((r) => r.runsAnalyzed >= 2).length

  if (flags.hasRenderedPrompts) {
    confidenceReasons.push("Rendered prompts found.")
  } else {
    warnings.push(
      "Rendered prompts missing for many runs. Cache drift detection may be incomplete."
    )
  }
  if (flags.hasTokenUsage) {
    confidenceReasons.push("Input/output token usage found.")
  } else {
    warnings.push("Token usage data is missing. Waste estimates will be approximate.")
  }
  if (flags.hasCacheReadTelemetry) {
    confidenceReasons.push("Cache-read telemetry found.")
  } else {
    warnings.push(
      "Cached-token telemetry missing. Report uses prefix-drift estimation only."
    )
  }
  if (flags.hasCacheCreationTelemetry) {
    confidenceReasons.push("Cache-creation telemetry found.")
  }
  if (flags.hasProviderMetadata) {
    confidenceReasons.push("Provider metadata found.")
  } else {
    warnings.push("Provider metadata missing. Cost estimates may be less accurate.")
  }
  if (flags.hasModelMetadata) {
    confidenceReasons.push("Model metadata found.")
  } else {
    warnings.push("Model metadata missing. Cost estimates may be less accurate.")
  }

  if (comparableRunGroups >= 3) {
    confidenceReasons.push(`${comparableRunGroups} comparable route groups found.`)
  } else if (comparableRunGroups > 0) {
    confidenceReasons.push(`${comparableRunGroups} comparable route group(s) found.`)
  } else {
    warnings.push("Few comparable runs found. Route-level conclusions may be noisy.")
  }

  if (runsAnalyzed < 10) {
    warnings.push(`Only ${runsAnalyzed} runs analyzed. Increase window or limit for better signal.`)
  }

  return {
    hasRenderedPrompts: flags.hasRenderedPrompts,
    hasTokenUsage: flags.hasTokenUsage,
    hasCacheReadTelemetry: flags.hasCacheReadTelemetry,
    hasCacheCreationTelemetry: flags.hasCacheCreationTelemetry,
    hasProviderMetadata: flags.hasProviderMetadata,
    hasModelMetadata: flags.hasModelMetadata,
    comparableRunGroups,
    warnings,
    confidenceReasons,
  }
}

export function calculateReportConfidence(dataQuality: DataQuality): Confidence {
  const hasGoodData =
    dataQuality.hasRenderedPrompts &&
    dataQuality.hasTokenUsage &&
    dataQuality.hasProviderMetadata &&
    dataQuality.hasModelMetadata

  if (
    hasGoodData &&
    dataQuality.hasCacheReadTelemetry &&
    (dataQuality.comparableRunGroups >= 3 ||
      (dataQuality.comparableRunGroups >= 1 && dataQuality.hasCacheCreationTelemetry))
  ) {
    return "high"
  }
  if (dataQuality.hasRenderedPrompts && dataQuality.hasTokenUsage) return "medium"
  return "low"
}

export function calculateDiagnosisConfidence(dataQuality: DataQuality): Confidence {
  if (
    dataQuality.hasRenderedPrompts &&
    dataQuality.comparableRunGroups >= 3 &&
    dataQuality.hasProviderMetadata &&
    dataQuality.hasModelMetadata
  ) {
    return "high"
  }
  if (dataQuality.hasRenderedPrompts && dataQuality.comparableRunGroups >= 1) {
    return "medium"
  }
  return "low"
}

export function calculateMoneyConfidence(dataQuality: DataQuality): Confidence {
  if (
    dataQuality.hasTokenUsage &&
    dataQuality.hasCacheReadTelemetry &&
    dataQuality.hasProviderMetadata &&
    dataQuality.hasModelMetadata &&
    dataQuality.comparableRunGroups >= 2
  ) {
    return "high"
  }
  if (dataQuality.hasTokenUsage && dataQuality.hasRenderedPrompts) {
    return "medium"
  }
  return "low"
}

export function telemetryQuality(dataQuality: DataQuality): "complete" | "partial" | "weak" {
  if (
    dataQuality.hasRenderedPrompts &&
    dataQuality.hasTokenUsage &&
    dataQuality.hasCacheReadTelemetry &&
    dataQuality.hasProviderMetadata &&
    dataQuality.hasModelMetadata
  ) {
    return "complete"
  }
  if (dataQuality.hasRenderedPrompts && (dataQuality.hasTokenUsage || dataQuality.comparableRunGroups > 0)) {
    return "partial"
  }
  return "weak"
}

export function calculateScore(input: {
  summary: {
    observedCacheReadRate: number | null
  }
  findings: CacheFinding[]
  routes: RouteAudit[]
  dataQuality?: DataQuality
}): number {
  let score = 100

  const observedRate = input.summary.observedCacheReadRate
  if (observedRate !== null && observedRate !== undefined) {
    const ratePct = observedRate * 100
    if (ratePct < 5) score -= 25
    else if (ratePct < 10) score -= 18
    else if (ratePct < 20) score -= 10
    else if (ratePct < 40) score -= 5
  } else {
    score -= 10
  }

  if (input.routes.length > 0) {
    const avgDivergence =
      input.routes.reduce((sum, r) => sum + r.avgFirstDivergenceToken, 0) /
      input.routes.length
    if (avgDivergence < 50) score -= 15
    else if (avgDivergence < 200) score -= 10
    else if (avgDivergence < 500) score -= 5
    else if (avgDivergence >= 1000) score += 5
  }

  const highOrCritical = input.findings.filter(
    (f) => f.severity === "high" || f.severity === "critical"
  ).length
  score -= highOrCritical * 8

  const mediumFindings = input.findings.filter((f) => f.severity === "medium").length
  score -= mediumFindings * 4

  const lowFindings = input.findings.filter((f) => f.severity === "low").length
  score -= lowFindings * 2

  if (input.dataQuality) {
    if (!input.dataQuality.hasCacheReadTelemetry) score -= 5
    if (!input.dataQuality.hasRenderedPrompts) score -= 10
    if (!input.dataQuality.hasTokenUsage) score -= 5
    if (input.dataQuality.warnings.length > 3) {
      score -= input.dataQuality.warnings.length * 2
    }
  }

  if (input.dataQuality && input.dataQuality.comparableRunGroups < 2) {
    score -= 10
  }

  return Math.max(0, Math.min(100, Math.round(score)))
}

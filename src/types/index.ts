/**
 * Provider-agnostic types for Cachecatch.
 *
 * The `NormalizedTrace` interface is the source of truth for all linting,
 * scoring, and reporting. Provider adapters (LangSmith, Langfuse, Braintrust)
 * transform their native run shapes into `NormalizedTrace[]` so the engine
 * never has to know which provider produced the data.
 */

export type Provider = "langsmith" | "langfuse" | "braintrust" | "mock" | "sample"

export type AuditWindow = "24h" | "7d" | "30d" | "1y"

export type Confidence = "low" | "medium" | "high"

export type Severity = "low" | "medium" | "high" | "critical"

export type FindingBasis = "observed" | "estimated" | "data_quality"

export type CacheBreakerType =
  | "early_dynamic_metadata"
  | "timestamp_in_prefix"
  | "request_id_in_prefix"
  | "tool_schema_drift"
  | "rag_before_stable_context"
  | "dynamic_system_prompt"
  | "model_or_provider_drift"
  | "missing_cache_telemetry"
  | "observed_cache_read_low"
  | "estimated_cache_opportunity_high"
  | "unknown"

export type MessageRole = "system" | "user" | "assistant" | "tool"

export interface TraceMessage {
  role: MessageRole
  content: string
}

/**
 * The single canonical shape every adapter must produce.
 * The engine operates on `NormalizedTrace[]` and nothing else.
 */
export interface NormalizedTrace {
  traceId: string
  provider: Provider
  model: string
  route: string
  messages: TraceMessage[]
  /** Flattened text of all messages, joined by newlines. Used by prefix analyzers. */
  promptText: string
  metrics: {
    cacheReadTokens: number
    cacheCreationTokens: number
    totalInputTokens: number
    totalOutputTokens: number
    /** Estimated cost in USD for this single trace, if observed. */
    costUsd: number
    /** Estimated cost of the wasted stable tokens, derived heuristically. */
    estimatedWasteUsd: number
  }
  startedAt?: string
  metadata?: Record<string, unknown>
}

export interface CacheFinding {
  id: string
  type: CacheBreakerType
  severity: Severity
  title: string
  route: string
  evidence: string
  basis: FindingBasis
  firstDivergenceToken?: number
  estimatedLostTokens?: number
  estimatedMonthlyWasteUsd?: number
  recommendation: string
}

export interface RouteAudit {
  route: string
  model?: string
  provider?: string
  runsAnalyzed: number

  observedInputTokens: number
  observedCacheReadTokens: number
  observedCacheCreationTokens: number
  observedCacheReadRate: number | null

  estimatedReusableTokensAfterDivergence: number
  estimatedCacheOpportunityTokens: number
  estimatedMonthlyWasteUsd: number

  avgInputTokens: number
  avgFirstDivergenceToken: number
  findings: CacheFinding[]
}

export interface DataQuality {
  hasRenderedPrompts: boolean
  hasTokenUsage: boolean
  hasCacheReadTelemetry: boolean
  hasCacheCreationTelemetry: boolean
  hasProviderMetadata: boolean
  hasModelMetadata: boolean
  comparableRunGroups: number
  warnings: string[]
  confidenceReasons: string[]
}

export interface RecommendedLayout {
  stablePrefix: string[]
  dynamicTail: string[]
}

export interface CachecatchRouteDiagnostic {
  route: string
  model?: string
  monthlyRecoverableLossUsd: number
  avgInputTokens: number
  observedCacheReadRate: number | null
  expectedCacheReadRate: string
  firstDivergenceToken: number
  mainIssue: string
  detectedFields: string[]
  cause: string
  sourceLocation?: string
  evidence: {
    traceId: string
    changingValue: string
    comparisonTraceId?: string
    comparisonValue?: string
    patternRate: string
  }
  whyItHurts: {
    human: string
    technical: string
  }
  whatToChange: string[]
  agentInstruction: string
  validation: {
    command: string
    successCriteria: string[]
  }
}

export interface CachecatchReportDetails {
  diagnosisConfidence?: Confidence
  moneyConfidence?: Confidence
  telemetryQuality?: "complete" | "partial" | "weak"
  confidenceReason?: string
  estimateLabel?: "Estimated recoverable cache loss" | "Directional token estimate" | "Prefix-drift estimate"
  targetCacheReadRate?: string
  projectedMonthlyRuns?: number
  projectionFormula?: string
  missedReusableTokensPerRun?: number
  windowMissedReusableTokens?: number
  windowMissedReusableTokensFormula?: string
  projectedMonthlyMissedReusableTokens?: number
  monthlyMissedReusableTokensFormula?: string
  blendedUncachedInputCostPerMillion?: number
  blendedCachedReadCostPerMillion?: number
  recoverableDeltaPerMillion?: number
  monthlyRecoverableCacheLossPrecise?: number
  monthlyRecoverableCacheLossFormula?: string
  fastestFirstFix?: string
  credibilityReason?: string
  savingsAccuracyNote?: string
  telemetryDocsUrl?: string
  routeDiagnostics?: CachecatchRouteDiagnostic[]
}

export interface CachecatchReport {
  id: string
  createdAt: string
  source: Provider
  projectName: string
  projectUrl?: string
  window: AuditWindow
  score: number
  confidence: Confidence
  summary: {
    runsAnalyzed: number
    routesAnalyzed: number
    observedCacheReadTokens: number
    observedCacheCreationTokens: number
    observedInputTokens: number
    observedOutputTokens: number
    observedCacheReadRate: number | null
    estimatedReusableTokensAfterDivergence: number
    estimatedCacheOpportunityTokens: number
    estimatedMonthlyWasteUsd: number
    topBreaker: string
  }
  routes: RouteAudit[]
  findings: CacheFinding[]
  recommendedLayout: RecommendedLayout
  fixPlan: string[]
  dataQuality: DataQuality
  details?: CachecatchReportDetails
}

/**
 * Provider-agnostic adapter contract. Every adapter
 * (LangSmith, Langfuse, Braintrust, Mock) implements this.
 */
export interface ProviderAdapter {
  readonly id: Provider
  readonly displayName: string

  /** Resolve a user-supplied project ref (name, ID, URL) to a usable handle. */
  resolveProject(ref: string): Promise<{ id: string; name: string; url?: string }>

  /** Fetch a window of traces and normalize them. */
  fetchTraces(args: {
    project: string
    apiKey?: string
    window: AuditWindow
    limit?: number
    baseUrl?: string
  }): Promise<{ traces: NormalizedTrace[]; projectName: string; projectUrl?: string }>
}

export interface AuditOptions {
  project: string
  provider: Provider
  window: AuditWindow
  apiKey?: string
  baseUrl?: string
  limit?: number
  /** If true, return the raw report without rendering. */
  json?: boolean
  /** If true, write the HTML report to disk. */
  exportHtml?: string
}

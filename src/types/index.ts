/**
 * Provider-agnostic types for Cachecatch.
 *
 * The `NormalizedTrace` interface is the source of truth for all linting,
 * scoring, and reporting. Provider adapters (LangSmith, Langfuse, Braintrust)
 * transform their native run shapes into `NormalizedTrace[]` so the engine
 * never has to know which provider produced the data.
 */

export type Provider = "langsmith" | "langfuse" | "braintrust" | "mock" | "sample"

export type LocalAgentProvider = "claude-code" | "codex" | "opencode"

export type AgentTelemetryVisibility =
  | "exact_cache_telemetry"
  | "token_telemetry_only"
  | "transcript_context_only"
  | "unavailable"

export type AgentTelemetrySource =
  | "local_db"
  | "local_jsonl"
  | "otel_logs"
  | "otel_metrics"
  | "transcript"

export interface NormalizedAgentTelemetry {
  agent: LocalAgentProvider
  source: AgentTelemetrySource
  visibility: AgentTelemetryVisibility
  sessions: number
  runs: number
  modelCounts: Record<string, number>
  toolCalls: number
  subagentRuns: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  cacheWriteTokens: number
  cachedInputTokens: number
  uncachedInputTokens: number
  costUsd: number | null
  requestCount: number
  errorCount: number
  cacheReadRate: number | null
  cacheReadDenominatorTokens?: number | null
  inputTokensMeaning?: "uncached_only" | "total_input_including_cached" | "unknown"
  cachedInputMeaning?: "separate_cache_read" | "subset_of_input" | "unknown"
  telemetryConfidence: Confidence
  confidenceNotes: string[]
}

export interface Metric<T> {
  value: T
  unit: "count" | "tokens" | "usd" | "percent" | "sessions" | "models"
  sourceAgent?: LocalAgentProvider
  sourceFileOrSourceType?: string
  telemetryKind:
    | "observed_cache_telemetry"
    | "observed_token_telemetry"
    | "observed_cost_telemetry"
    | "estimated_from_transcript"
    | "inferred"
    | "unavailable"
  confidence: Confidence | "unavailable"
  includedInGlobalTotal: boolean
  exclusionReason?: string
  notes?: string[]
}

export type AuditWindow = "24h" | "7d" | "30d" | "1y"

export type Confidence = "low" | "medium" | "high"

export type Severity = "low" | "medium" | "high" | "critical"

export type FindingBasis = "observed" | "estimated" | "data_quality"

export type ReportMode = "financial_cache_audit" | "prefix_diagnostic"

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
  firstDivergenceChar?: number
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
  avgFirstDivergenceChar?: number
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

/**
 * A concrete, route-aware prompt-rebuild plan.
 *
 * Produced by `src/engine/route-rebuild.ts` from the divergence
 * position in `prefix-matcher.ts` and the field positions in
 * `detectors.ts`. The advice generator in `src/engine/advice.ts`
 * reads this object to write route-specific copy — not the
 * historical 11 hardcoded one-liners.
 */
export interface RoutePromptRebuild {
  route: string
  model?: string
  /** Labels the route's stable prefix should carry. Derived from the breaker shape, not hardcoded. */
  stableHeader: string[]
  /** Fields detected in the stable prefix that should be moved to the dynamic tail. */
  fieldsToMoveDown: { name: string; currentChar: number; firstSeen: string }[]
  /** Tool schemas or examples that should be sorted / versioned. */
  fieldsToSort: { kind: "tool_schema" | "examples"; reason: string }[]
  /** Real before/after prompt slice from two comparable traces (when ≥2 traces exist). */
  exampleDiff: {
    from: { traceId: string; char: number; slice: string }
    to: { traceId: string; char: number; slice: string }
  } | null
  /** Stable token count the route would have if the rebuild were applied. */
  reusableTokensAfterFix: number
  /** Expected cache-read rate after the fix is applied, in [0, 1]. Clamped to ≥ current rate. */
  expectedCacheReadRateAfterFix: number
  /** Expected monthly savings after the fix, in USD. null when pricing is missing. */
  expectedMonthlySavingsUsd: number | null
  /** Cache-contract rule string (provider-specific cache key requirements), when known. */
  cacheContractNote: string | null
}

/** Route-specific, dynamic advice. Generated per-route by `src/engine/advice.ts`. */
export interface FixAdvice {
  title: string
  oneLiner: string
  whatToChange: string[]
  whyItHurts: { human: string; technical: string }
  agentInstruction: string
  validation: { command: string; successCriteria: string[] }
  sourceLocation?: string
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
  firstDivergenceChar?: number
  firstDivergenceTokenApproximate?: boolean
}

export interface CachecatchReportDetails {
  reportMode?: ReportMode
  diagnosisConfidence?: Confidence
  moneyConfidence?: Confidence
  pricingConfidence?: Confidence
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
  pricingBasis?: string
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
  /** Parallel to `routes`: a concrete rebuild plan per route. */
  rebuilds?: RoutePromptRebuild[]
  /** Parallel to `routes`: route-specific dynamic advice. */
  advice?: FixAdvice[]
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

export interface LocalAgentMoneyRange {
  low?: number
  high?: number
  currency: "USD"
  label: "estimated"
}

export interface LocalAgentCacheMissRange {
  lowPercent: number
  highPercent: number
}

export interface LocalAgentFinding {
  id: string
  title: string
  severity: Severity
  agent?: LocalAgentProvider
  evidence: string
  recommendation: string
}

export interface LocalAgentRecommendation {
  id: string
  title: string
  action: string
  suggestedMarkdown?: {
    filename: "AGENTS.md" | "CLAUDE.md"
    content: string
  }
}

export interface LocalAgentModelSummary {
  rawName: string
  normalizedName?: string
  provider?: string
  sessions: number
  pricingKnown: boolean
  pricingConfidence: Confidence
  note?: string
}

export interface LocalAgentProjectSummary {
  path: string
  sessions: number
  totalTokens: number
  cacheReadPercent: number | null
  modelCostUsd: number | null
  agentsMdStatus?: "missing" | "weak" | "present" | "unknown"
  claudeMdStatus?: "missing" | "weak" | "present" | "unknown"
  hasAgentsMd?: boolean
  hasClaudeMd?: boolean
  /** Legacy: short bullets rendered in the terminal report. */
  advice: string[]
  /** New: route-specific dynamic advice from `src/engine/advice.ts`. */
  fixAdvice?: FixAdvice
}

export interface LocalAgentActivitySummary {
  toolCalls: number
  subagentRuns: number
  topSubagents: Array<{ name: string; sessions: number }>
}

export interface LocalAgentReport {
  reportType: "local-agent-context-audit"
  generatedAt: string
  window: string
  summary: {
    status?: string
    cacheLeakScore: number | null
    recoverableCashSaving?: LocalAgentMoneyRange | null
    estimatedCacheMissRange?: LocalAgentCacheMissRange | null
    agentsScanned: number
    sessionsFound: number
    sessionsInWindow: number
    sessionsAnalyzed: number
    totalTokens: number
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    cacheReadPercent: number | null
    modelCostUsd: number | null
    tokenAccounting: "observed" | "estimated" | "mixed" | "unavailable"
    visibility: AgentTelemetryVisibility
    coverage?: {
      cacheTokenTelemetry: "full" | "partial" | "unavailable"
      costTelemetry: "full" | "partial" | "unavailable"
      pricingCoverage: "full" | "partial" | "unavailable"
      transcriptCoverage: "full" | "partial" | "unavailable"
    }
    metrics?: Record<string, Metric<number | null>>
    sanityWarnings?: string[]
    toolCalls: number
    subagentRuns: number
    modelsDetected: number
    confidence: Confidence
    mainFinding: string
  }
  agents: Array<{
    provider: LocalAgentProvider
    detected: boolean
    sessionsFound: number
    sessionsInWindow: number
    sessionsAnalyzed: number
    totalTokens: number
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    cacheReadPercent: number | null
    modelCostUsd: number | null
    tokenAccounting: "observed" | "estimated" | "mixed" | "unavailable"
    visibility: AgentTelemetryVisibility
    telemetrySources: AgentTelemetrySource[]
    telemetryConfidence: Confidence
    confidenceNotes: string[]
    cacheFieldPresent?: boolean
    costFieldPresent?: boolean
    metrics?: Record<string, Metric<number | null>>
    toolCalls: number
    subagentRuns: number
    topSubagents: Array<{ name: string; sessions: number }>
    modelsDetected: string[]
    cacheLeakScore: number
    estimatedCacheMissRange?: LocalAgentCacheMissRange
    recoverableCashSaving?: LocalAgentMoneyRange | null
    mainFinding: string
    findings: LocalAgentFinding[]
    recommendations: LocalAgentRecommendation[]
  }>
  modelsDetected: LocalAgentModelSummary[]
  projects: LocalAgentProjectSummary[]
  activity: LocalAgentActivitySummary
  findings: LocalAgentFinding[]
  recommendations: LocalAgentRecommendation[]
  diagnostics: {
    providers: Array<{
      provider: string
      rootPaths: string[]
      candidatesFound: number
      candidatesInWindow: number
      filesAttempted: number
      parsedSessions: number
      skippedFiles: number
      failedFiles: number
      topFailureReasons: Array<{ reason: string; count: number }>
      sampleCandidates: Array<{
        path: string
        sizeBytes?: number
        modifiedAt?: string
        candidateType?: "jsonl" | "json" | "sqlite" | "unknown"
        parserTried?: string
        parseStatus: "parsed" | "failed" | "skipped"
        parseReason?: string
        topLevelKeys?: string[]
        eventTypes?: string[]
      }>
    }>
  }
  pricingDisclaimer: string
}

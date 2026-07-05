import type { CachecatchReport, CacheFinding, RouteAudit, FixAdvice, RoutePromptRebuild } from "./types.js"
import { buildRouteRebuild } from "../../src/engine/route-rebuild.ts"
import { adviceForRoute } from "../../src/engine/advice.ts"
import { pricingForModel } from "../../src/engine/pricing.ts"

type SampleRoute = {
  route: string
  model: string
  runsAnalyzed: number
  monthlyLoss: number
  avgInputTokens: number
  observedRate: number
  expectedRate: string
  firstDivergenceToken: number
  reusableTokens: number
  opportunityTokens: number
  issue: string
  title: string
  fields: string[]
  cause: string
  type: CacheFinding["type"]
  severity: CacheFinding["severity"]
  sourceLocation?: string
  evidence: {
    traceId: string
    changingValue: string
    comparisonTraceId?: string
    comparisonValue?: string
    patternRate: string
  }
  whyHuman: string
  whyTechnical: string
  whatToChange: string[]
  agentInstruction: string
  successCriteria: string[]
}

const routes: SampleRoute[] = [
  {
    route: "support_agent.answer",
    model: "gpt-4o",
    runsAnalyzed: 22400,
    monthlyLoss: 6940,
    avgInputTokens: 21400,
    observedRate: 0.058,
    expectedRate: "67%",
    firstDivergenceToken: 612,
    reusableTokens: 9650,
    opportunityTokens: 203500000,
    issue:
      "current_time, request_id, and session_id are injected before the stable support policy.",
    title: "Timestamp and request identifiers break the support prefix",
    fields: ["current_time", "request_id", "session_id"],
    cause: "timestamp + request_id in prefix",
    type: "timestamp_in_prefix",
    severity: "critical",
    sourceLocation: "src/agents/support/prompt.ts -> buildSupportPrompt()",
    evidence: {
      traceId: "support_agent.answer-000419",
      changingValue: "current_time: 2026-07-01T04:20:50Z",
      comparisonTraceId: "support_agent.answer-000420",
      comparisonValue: "current_time: 2026-07-01T04:21:07Z",
      patternRate: "91.8% of comparable support_agent.answer traces",
    },
    whyHuman:
      "The timestamp changes every run, so the long support policy that follows is treated like fresh context.",
    whyTechnical:
      "Prompt caching is prefix-sensitive; a volatile token at position 612 invalidates reuse for stable policy, tools, and examples downstream.",
    whatToChange: [
      "Render system role, support policy, refund/escalation rules, tool definitions, and static examples first.",
      "Append current_time, request_id, session_id, customer context, user message, and tool outputs in the dynamic tail.",
    ],
    agentInstruction:
      "Refactor support_agent.answer prompt assembly into stable_prefix and dynamic_tail. The stable_prefix must contain support policy, tool schemas, refund/escalation rules, and few-shot examples. The dynamic_tail must contain current_time, request_id, session_id, customer context, user message, and tool outputs. Do not include timestamps, request IDs, or session IDs before stable_prefix.",
    successCriteria: [
      "cache-read rate moves from 5.8% to 45%+",
      "first divergence moves after the stable support prefix",
      "recovered tokens/run increases by at least 8K",
    ],
  },
  {
    route: "refund_agent.review",
    model: "gpt-4o",
    runsAnalyzed: 11200,
    monthlyLoss: 3280,
    avgInputTokens: 17900,
    observedRate: 0.071,
    expectedRate: "61%",
    firstDivergenceToken: 438,
    reusableTokens: 7820,
    opportunityTokens: 95800000,
    issue: "order_id and customer metadata appear before the stable refund policy.",
    title: "Order identifiers are rendered before refund policy",
    fields: ["order_id", "customer_id", "customer_tier"],
    cause: "order_id before refund policy",
    type: "request_id_in_prefix",
    severity: "critical",
    sourceLocation: "src/agents/refunds/prompt.ts -> buildRefundReviewPrompt()",
    evidence: {
      traceId: "refund_agent.review-000122",
      changingValue: "order_id: ORD-5000",
      comparisonTraceId: "refund_agent.review-000123",
      comparisonValue: "order_id: ORD-5001",
      patternRate: "88.4% of comparable refund_agent.review traces",
    },
    whyHuman:
      "Every order has a different ID, but the refund rules and fraud checks are repeated and should be reusable.",
    whyTechnical:
      "Putting order metadata before policy creates a unique prefix for each order and prevents provider cache reads on the stable refund block.",
    whatToChange: [
      "Split the builder into stable_refund_policy and dynamic_order_context.",
      "Render refund rules, approval criteria, fraud checks, tone, escalation policy, and tool definitions before order/customer data.",
    ],
    agentInstruction:
      "In refund_agent.review, move order_id, customer_id, and customer_tier below the stable refund policy and fraud-check instructions. Keep refund rules, approval criteria, escalation policy, and tool definitions identical across requests.",
    successCriteria: [
      "first divergence moves past the refund policy block",
      "cache-read rate reaches 40%+ in the first validation window",
      "order_id is only present in dynamic_order_context",
    ],
  },
  {
    route: "docs_rag.summarize",
    model: "gpt-4o-mini",
    runsAnalyzed: 8400,
    monthlyLoss: 2210,
    avgInputTokens: 24800,
    observedRate: 0.116,
    expectedRate: "52%",
    firstDivergenceToken: 1184,
    reusableTokens: 8920,
    opportunityTokens: 64600000,
    issue: "retrieved_chunks are inserted before stable summarization rules.",
    title: "RAG chunks enter before reusable summarization rules",
    fields: ["retrieved_chunks", "doc_ids", "search_query"],
    cause: "RAG chunks before stable rules",
    type: "rag_before_stable_context",
    severity: "high",
    sourceLocation: "src/rag/summarize.ts -> buildSummaryPrompt()",
    evidence: {
      traceId: "docs_rag.summarize-000088",
      changingValue: "retrieved_chunks: [kb_44, kb_19, kb_02, ...]",
      comparisonTraceId: "docs_rag.summarize-000089",
      comparisonValue: "retrieved_chunks: [kb_91, kb_03, kb_77, ...]",
      patternRate: "82.6% of comparable docs_rag.summarize traces",
    },
    whyHuman:
      "Retrieved documents change with each query, while the summary rules, citation format, and refusal policy stay the same.",
    whyTechnical:
      "When retrieval output precedes stable rules, cache matching diverges before the largest reusable instruction block.",
    whatToChange: [
      "Render summarization role, output format, citation rules, uncertainty policy, and examples first.",
      "Append search_query, doc_ids, retrieved_chunks, and the requested summary task afterward.",
    ],
    agentInstruction:
      "In docs_rag.summarize, render stable summarization instructions first. Only then append search_query, doc_ids, retrieved_chunks, and the user task. Do not place retrieved_chunks before the stable_prefix.",
    successCriteria: [
      "cache-read rate improves even when retrieved docs differ",
      "first divergence moves after summarization rules and examples",
      "retrieved_chunks appears only in dynamic_context",
    ],
  },
  {
    route: "sales_agent.compose",
    model: "gpt-4o",
    runsAnalyzed: 5600,
    monthlyLoss: 1150,
    avgInputTokens: 15600,
    observedRate: 0.095,
    expectedRate: "58%",
    firstDivergenceToken: 724,
    reusableTokens: 5660,
    opportunityTokens: 33600000,
    issue:
      "user/company enrichment enters the prefix before stable sales voice and examples.",
    title: "CRM enrichment appears before sales voice and examples",
    fields: ["company_name", "lead_score", "crm_notes"],
    cause: "CRM enrichment before examples",
    type: "early_dynamic_metadata",
    severity: "high",
    sourceLocation: "src/agents/sales/prompt.ts -> composeOutboundPrompt()",
    evidence: {
      traceId: "sales_agent.compose-000241",
      changingValue: "company_name: Northstar Devices",
      comparisonTraceId: "sales_agent.compose-000242",
      comparisonValue: "company_name: Vertex Labs",
      patternRate: "76.9% of comparable sales_agent.compose traces",
    },
    whyHuman:
      "Lead enrichment is request-specific, but the voice guide and examples are stable assets the model sees repeatedly.",
    whyTechnical:
      "Different CRM data in the prefix prevents cache reuse for the sales voice, objection-handling rules, and examples that follow.",
    whatToChange: [
      "Move company_name, lead_score, and crm_notes below the stable sales voice guide.",
      "Keep static email examples and tone rules byte-stable across requests.",
    ],
    agentInstruction:
      "In sales_agent.compose, split stable_sales_voice from dynamic_lead_context. Render tone rules, positioning, objection handling, and static examples first; then append company_name, lead_score, crm_notes, recent activity, and the user request.",
    successCriteria: [
      "cache-read rate reaches 35%+",
      "first divergence moves after sales examples",
      "CRM fields are absent from stable_sales_voice",
    ],
  },
  {
    route: "tool_router.plan",
    model: "gpt-4o",
    runsAnalyzed: 5040,
    monthlyLoss: 870,
    avgInputTokens: 13200,
    observedRate: 0.134,
    expectedRate: "49%",
    firstDivergenceToken: 1020,
    reusableTokens: 4310,
    opportunityTokens: 25400000,
    issue:
      "tool schema block changes between runs because runtime availability is injected too early.",
    title: "Runtime tool availability drifts inside the schema prefix",
    fields: ["available_tools", "tool_schema_hash", "environment_flags"],
    cause: "changing tool schema prefix",
    type: "tool_schema_drift",
    severity: "medium",
    sourceLocation: "src/router/tools.ts -> buildToolPlanningPrompt()",
    evidence: {
      traceId: "tool_router.plan-000311",
      changingValue: "available_tools: [search_docs, lookup_order, escalate]",
      comparisonTraceId: "tool_router.plan-000312",
      comparisonValue: "available_tools: [search_docs, lookup_order]",
      patternRate: "69.7% of comparable tool_router.plan traces",
    },
    whyHuman:
      "The router keeps changing the tool block even when the planning rules are the same.",
    whyTechnical:
      "A mutable schema hash before stable planning instructions causes avoidable prefix misses across otherwise comparable router calls.",
    whatToChange: [
      "Freeze and sort the stable tool schema block by version.",
      "Move runtime availability and environment flags into a later dynamic availability section.",
    ],
    agentInstruction:
      "In tool_router.plan, render a stable, sorted, versioned tool schema block first. Move available_tools, tool_schema_hash, and environment_flags to a dynamic runtime_availability block after planning policy and examples.",
    successCriteria: [
      "tool schema prefix remains identical within a deploy window",
      "first divergence moves after planning policy",
      "cache-read rate reaches 30%+",
    ],
  },
  {
    route: "escalation_agent.resolve",
    model: "gpt-4o",
    runsAnalyzed: 3360,
    monthlyLoss: 550,
    avgInputTokens: 19100,
    observedRate: 0.152,
    expectedRate: "44%",
    firstDivergenceToken: 890,
    reusableTokens: 3720,
    opportunityTokens: 15120000,
    issue: "conversation memory summary changes before stable escalation policy.",
    title: "Memory summary precedes escalation policy",
    fields: ["memory_summary", "last_agent_state", "escalation_reason"],
    cause: "memory summary before policy",
    type: "early_dynamic_metadata",
    severity: "medium",
    sourceLocation: "src/agents/escalation/prompt.ts -> buildEscalationPrompt()",
    evidence: {
      traceId: "escalation_agent.resolve-000077",
      changingValue: "memory_summary: Customer has contacted support 3 times...",
      comparisonTraceId: "escalation_agent.resolve-000078",
      comparisonValue: "memory_summary: Customer was transferred from billing...",
      patternRate: "64.1% of comparable escalation_agent.resolve traces",
    },
    whyHuman:
      "Memory summaries are useful, but they change constantly. The escalation policy should stay reusable.",
    whyTechnical:
      "Dynamic memory before policy shifts the cache boundary ahead of stable escalation rules and tool definitions.",
    whatToChange: [
      "Render escalation role, severity rubric, handoff policy, and tools before memory_summary.",
      "Append last_agent_state and escalation_reason with the user-specific case context.",
    ],
    agentInstruction:
      "In escalation_agent.resolve, move memory_summary, last_agent_state, and escalation_reason after the stable escalation policy, severity rubric, handoff rules, and tool definitions.",
    successCriteria: [
      "first divergence moves after escalation policy",
      "cache-read rate reaches 28%+",
      "memory_summary appears only in dynamic_case_context",
    ],
  },
]

const observedInputTokens = 56_000 * 18_900
const observedCacheReadTokens = Math.round(observedInputTokens * 0.084)
const observedCacheCreationTokens = Math.round(observedInputTokens * 0.162)
const observedOutputTokens = Math.round(observedInputTokens * 0.11)
const projectedMonthlyMissedTokens = 1_960_800_000

function findingFor(route: SampleRoute, index: number): CacheFinding {
  return {
    id: `sample-finding-${String(index + 1).padStart(3, "0")}`,
    type: route.type,
    severity: route.severity,
    title: route.title,
    route: route.route,
    evidence: `Trace ${route.evidence.traceId}: first divergence at token ${route.firstDivergenceToken} on "${route.evidence.changingValue}". Pattern detected in ${route.evidence.patternRate}.`,
    basis: "observed",
    firstDivergenceToken: route.firstDivergenceToken,
    estimatedLostTokens: route.reusableTokens,
    estimatedMonthlyWasteUsd: route.monthlyLoss,
    recommendation: route.agentInstruction,
  }
}

function auditFor(route: SampleRoute, index: number): RouteAudit {
  const finding = findingFor(route, index)
  return {
    route: route.route,
    model: route.model,
    provider: "openai",
    runsAnalyzed: route.runsAnalyzed,
    observedInputTokens: route.runsAnalyzed * route.avgInputTokens,
    observedCacheReadTokens: Math.round(
      route.runsAnalyzed * route.avgInputTokens * route.observedRate
    ),
    observedCacheCreationTokens: Math.round(
      route.runsAnalyzed * route.avgInputTokens * 0.16
    ),
    observedCacheReadRate: route.observedRate,
    estimatedReusableTokensAfterDivergence: route.reusableTokens,
    estimatedCacheOpportunityTokens: route.opportunityTokens,
    estimatedMonthlyWasteUsd: route.monthlyLoss,
    avgInputTokens: route.avgInputTokens,
    avgFirstDivergenceToken: route.firstDivergenceToken,
    findings: [finding],
  }
}

const routeAudits = routes.map(auditFor)
const findings = routes.map(findingFor)

// Per-route rebuilds and dynamic advice for the sample. The sample
// has no real `NormalizedTrace[]` (it's a hand-curated demo), so we
// call `buildRouteRebuild` and `adviceForRoute` directly with the
// RouteAudit shape. The advice generator reads `route.findings` and
// the rebuild, so the output mirrors what a real audit produces.
const sampleRebuilds: RoutePromptRebuild[] = routeAudits.map((route) => {
  const price = pricingForModel(route.model)
  return buildRouteRebuild({
    route,
    traces: [],
    modelPrice: price,
    financialMode: true,
    recoverableDeltaPerMillion: price ? price.inputUsdPerMTok - price.cachedInputUsdPerMTok : undefined,
    monthlyProjectionFactor: 30 / 7,
  })
})
const sampleAdvice: FixAdvice[] = routeAudits.map((route, i) => {
  const price = pricingForModel(route.model)
  return adviceForRoute({
    route,
    rebuild: sampleRebuilds[i],
    findings: route.findings,
    modelPrice: price,
    reportMode: "financial_cache_audit",
    financialMode: true,
  })
})

export const sampleReport: CachecatchReport = {
  id: "sample-enterprise-001",
  createdAt: "2026-07-01T12:00:00Z",
  source: "sample",
  projectName: "Acme Enterprise Support Copilot",
  projectUrl: "https://smith.langchain.com/o/acme/projects/support-copilot",
  window: "7d",
  score: 18,
  confidence: "high",
  summary: {
    runsAnalyzed: 56_000,
    routesAnalyzed: 6,
    observedCacheReadTokens,
    observedCacheCreationTokens,
    observedInputTokens,
    observedOutputTokens,
    observedCacheReadRate: 0.084,
    estimatedReusableTokensAfterDivergence: 8_170,
    estimatedCacheOpportunityTokens: projectedMonthlyMissedTokens,
    estimatedMonthlyWasteUsd: 15_000,
    topBreaker:
      "Dynamic fields enter before stable policies, tool schemas, examples, and RAG rules.",
  },
  routes: routeAudits,
  findings,
  rebuilds: sampleRebuilds,
  advice: sampleAdvice,
  recommendedLayout: {
    stablePrefix: [
      "[system role and constraints]",
      "[policy and rules]",
      "[tool definitions]",
      "[static examples]",
    ],
    dynamicTail: [
      "[timestamp / request_id / session_id]",
      "[order_id / customer_id / CRM data]",
      "[RAG chunks / search results]",
      "[user message]",
      "[tool outputs]",
    ],
  },
  fixPlan: [
    "Priority 1 - support_agent.answer: move current_time, request_id, and session_id after support policy, tool definitions, and static examples.",
    "Priority 2 - refund_agent.review: render refund policy, approval criteria, fraud checks, and tools before order_id, customer_id, and customer_tier.",
    "Priority 3 - docs_rag.summarize: put summarization rules, output format, citation rules, and examples before search_query, doc_ids, and retrieved_chunks.",
    "Priority 4 - sales_agent.compose: move company_name, lead_score, and crm_notes below the stable sales voice guide and examples.",
    "Priority 5 - tool_router.plan: freeze the stable tool schema block and move runtime availability flags later.",
    "Priority 6 - escalation_agent.resolve: place memory summaries after escalation policy, severity rubric, and handoff rules.",
  ],
  dataQuality: {
    hasRenderedPrompts: true,
    hasTokenUsage: true,
    hasCacheReadTelemetry: true,
    hasCacheCreationTelemetry: true,
    hasProviderMetadata: true,
    hasModelMetadata: true,
    comparableRunGroups: 6,
    warnings: [],
    confidenceReasons: [
      "Rendered prompts found.",
      "Token usage found.",
      "Cache-read telemetry found.",
      "Cache-creation telemetry found.",
      "Model metadata found.",
      "6 comparable route groups found.",
      "Monthly projection shown.",
    ],
  },
  details: {
    reportMode: "financial_cache_audit",
    diagnosisConfidence: "high",
    moneyConfidence: "high",
    pricingConfidence: "high",
    targetCacheReadRate: "58-72%",
    projectedMonthlyRuns: 240_000,
    projectionFormula: "56,000 * 30 / 7 = 240,000",
    missedReusableTokensPerRun: 8_170,
    windowMissedReusableTokens: 457_520_000,
    windowMissedReusableTokensFormula: "56,000 * 8,170 = 457,520,000",
    projectedMonthlyMissedReusableTokens: projectedMonthlyMissedTokens,
    monthlyMissedReusableTokensFormula:
      "457,520,000 * 30 / 7 = 1,960,800,000",
    blendedUncachedInputCostPerMillion: 8.5,
    blendedCachedReadCostPerMillion: 0.85,
    recoverableDeltaPerMillion: 7.65,
    pricingBasis:
      "sample blended enterprise pricing; real audits use exact matched model pricing when available",
    monthlyRecoverableCacheLossPrecise: 15_000.12,
    monthlyRecoverableCacheLossFormula:
      "1,960.8M * $7.65 / 1M = $15,000.12",
    fastestFirstFix: "move timestamps/request IDs out of the prefix",
    credibilityReason:
      "rendered prompts, token usage, cache-read telemetry, cache-creation telemetry, model metadata, and comparable route groups found.",
    savingsAccuracyNote:
      "Savings math uses observed sample input-token volume, sample cache-read telemetry, the displayed monthly projection, and the displayed uncached-vs-cached input price delta. Real audits should use your provider telemetry, traffic mix, and pricing config.",
    telemetryDocsUrl: "https://docs.smith.langchain.com/observability",
    routeDiagnostics: routes.map((route) => ({
      route: route.route,
      model: route.model,
      monthlyRecoverableLossUsd: route.monthlyLoss,
      avgInputTokens: route.avgInputTokens,
      observedCacheReadRate: route.observedRate,
      expectedCacheReadRate: route.expectedRate,
      firstDivergenceToken: route.firstDivergenceToken,
      mainIssue: route.issue,
      detectedFields: route.fields,
      cause: route.cause,
      sourceLocation: route.sourceLocation,
      evidence: route.evidence,
      whyItHurts: {
        human: route.whyHuman,
        technical: route.whyTechnical,
      },
      whatToChange: route.whatToChange,
      agentInstruction: route.agentInstruction,
      validation: {
        command:
          'npx --yes cachecatch audit "Acme Enterprise Support Copilot" --provider langsmith --window 24h',
        successCriteria: route.successCriteria,
      },
    })),
  },
}

type LangSmithPrefixDiagnosticRoute = {
  route: string
  model: string
  runsAnalyzed: number
  avgInputTokens: number
  firstDivergenceToken: number
  reusableTokens: number
  opportunityTokens: number
  issue: string
  title: string
  fields: string[]
  cause: string
  type: CacheFinding["type"]
  severity: CacheFinding["severity"]
  sourceLocation?: string
  evidence: {
    traceId: string
    changingValue: string
    comparisonTraceId?: string
    comparisonValue?: string
    patternRate: string
  }
  whyHuman: string
  whyTechnical: string
  whatToChange: string[]
  agentInstruction: string
  successCriteria: string[]
}

const langSmithPrefixDiagnosticRoutes: LangSmithPrefixDiagnosticRoute[] = [
  {
    route: "support_agent.answer",
    model: "gpt-4o",
    runsAnalyzed: 1_280,
    avgInputTokens: 18_400,
    firstDivergenceToken: 32,
    reusableTokens: 9_200,
    opportunityTokens: 11_776_000,
    issue:
      "system_prompt_version and template_version are rendered before the stable support policy.",
    title: "Dynamic system prompt versioning breaks the support prefix",
    fields: ["system_prompt_version", "template_version"],
    cause: "dynamic system prompt",
    type: "dynamic_system_prompt",
    severity: "critical",
    sourceLocation: "src/agents/support/prompt.ts -> buildSupportPrompt()",
    evidence: {
      traceId: "support_agent.answer-000419",
      changingValue: "system_prompt_version: v1.4.2",
      comparisonTraceId: "support_agent.answer-000420",
      comparisonValue: "system_prompt_version: v1.4.3",
      patternRate: "87.3% of comparable support_agent.answer traces",
    },
    whyHuman:
      "Every deploy bumps the version field, so the long stable policy that follows is treated like fresh context every run.",
    whyTechnical:
      "A version string at the top of the prefix invalidates the cache for stable policy, tools, and examples downstream on every deploy.",
    whatToChange: [
      "Render version-agnostic system role, support policy, refund/escalation rules, tool definitions, and static examples first.",
      "Append system_prompt_version, template_version, request_id, customer context, user message, and tool outputs in the dynamic tail.",
    ],
    agentInstruction:
      "In support_agent.answer, move system_prompt_version and template_version below the stable prefix. Render support policy, refund/escalation rules, tool definitions, and few-shot examples first; append version metadata, request_id, customer context, and tool outputs after.",
    successCriteria: [
      "prefix stability improves across comparable traces",
      "first divergence moves past the version metadata line",
      "token usage and cached-token telemetry are present in the next audit",
    ],
  },
]

function prefixDiagnosticFindingFor(
  route: LangSmithPrefixDiagnosticRoute,
  index: number
): CacheFinding {
  return {
    id: `ls-prefix-dx-finding-${String(index + 1).padStart(3, "0")}`,
    type: route.type,
    severity: route.severity,
    title: route.title,
    route: route.route,
    evidence: `Trace ${route.evidence.traceId}: first divergence at token ${route.firstDivergenceToken} on "${route.evidence.changingValue}". Pattern detected in ${route.evidence.patternRate}.`,
    basis: "observed",
    firstDivergenceToken: route.firstDivergenceToken,
    estimatedLostTokens: route.reusableTokens,
    estimatedMonthlyWasteUsd: 0,
    recommendation: route.agentInstruction,
  }
}

function prefixDiagnosticAuditFor(
  route: LangSmithPrefixDiagnosticRoute,
  index: number
): RouteAudit {
  const finding = prefixDiagnosticFindingFor(route, index)
  return {
    route: route.route,
    model: route.model,
    provider: "openai",
    runsAnalyzed: route.runsAnalyzed,
    observedInputTokens: 0,
    observedCacheReadTokens: 0,
    observedCacheCreationTokens: 0,
    observedCacheReadRate: null,
    estimatedReusableTokensAfterDivergence: route.reusableTokens,
    estimatedCacheOpportunityTokens: route.opportunityTokens,
    estimatedMonthlyWasteUsd: 0,
    avgInputTokens: route.avgInputTokens,
    avgFirstDivergenceToken: route.firstDivergenceToken,
    findings: [finding],
  }
}

const langSmithPrefixDiagnosticAudits = langSmithPrefixDiagnosticRoutes.map(
  prefixDiagnosticAuditFor
)
const langSmithPrefixDiagnosticFindings = langSmithPrefixDiagnosticRoutes.map(
  prefixDiagnosticFindingFor
)

const lsPrefixDxRebuilds: RoutePromptRebuild[] = langSmithPrefixDiagnosticAudits.map((route) => {
  return buildRouteRebuild({
    route,
    traces: [],
    modelPrice: undefined,
    financialMode: false,
    monthlyProjectionFactor: 30 / 7,
  })
})
const lsPrefixDxAdvice: FixAdvice[] = langSmithPrefixDiagnosticAudits.map((route, i) => {
  return adviceForRoute({
    route,
    rebuild: lsPrefixDxRebuilds[i],
    findings: route.findings,
    modelPrice: undefined,
    reportMode: "prefix_diagnostic",
    financialMode: false,
  })
})

const lsPrefixDxObservedInputTokens = 0
const lsPrefixDxRunsAnalyzed = langSmithPrefixDiagnosticRoutes.reduce(
  (sum, route) => sum + route.runsAnalyzed,
  0
)
const lsPrefixDxWindowMissedReusableTokens = langSmithPrefixDiagnosticRoutes.reduce(
  (sum, route) => sum + route.runsAnalyzed * route.reusableTokens,
  0
)
const lsPrefixDxProjectedMonthlyMissedReusableTokens = Math.round(
  lsPrefixDxWindowMissedReusableTokens * (30 / 7)
)
const lsPrefixDxProjectedMonthlyRuns = Math.round(
  lsPrefixDxRunsAnalyzed * (30 / 7)
)

/**
 * LangSmith PREFIX DIAGNOSTIC mode sample.
 *
 * Models the realistic state of a LangSmith project where:
 *  - rendered prompts are present
 *  - provider + model fields are present
 *  - token usage and cache telemetry are NOT exported
 *  - the only detected prefix breaker is dynamic system prompt versioning
 *
 * This drives every PREFIX DIAGNOSTIC mode rendering path: the
 * "savings not provable yet" hero, the data-quality "missing" rows,
 * the prefix-stability label, and the BEFORE / FIX / AFTER map that
 * only renders the detected field (no generic placeholders).
 */
export const langSmithPrefixDiagnosticReport: CachecatchReport = {
  id: "sample-langsmith-prefix-diagnostic-001",
  createdAt: "2026-07-04T00:00:00Z",
  source: "langsmith",
  projectName: "Northstar AI Support Triage",
  projectUrl:
    "https://smith.langchain.com/o/northstar/projects/support-triage",
  window: "7d",
  score: 0,
  confidence: "medium",
  summary: {
    runsAnalyzed: lsPrefixDxRunsAnalyzed,
    routesAnalyzed: langSmithPrefixDiagnosticRoutes.length,
    observedCacheReadTokens: 0,
    observedCacheCreationTokens: 0,
    observedInputTokens: lsPrefixDxObservedInputTokens,
    observedOutputTokens: 0,
    observedCacheReadRate: null,
    estimatedReusableTokensAfterDivergence: Math.round(
      lsPrefixDxWindowMissedReusableTokens / Math.max(1, lsPrefixDxRunsAnalyzed)
    ),
    estimatedCacheOpportunityTokens: lsPrefixDxProjectedMonthlyMissedReusableTokens,
    estimatedMonthlyWasteUsd: 0,
    topBreaker:
      "Dynamic system prompt versioning breaks the support prefix before stable policy, tool definitions, and examples.",
  },
  routes: langSmithPrefixDiagnosticAudits,
  findings: langSmithPrefixDiagnosticFindings,
  rebuilds: lsPrefixDxRebuilds,
  advice: lsPrefixDxAdvice,
  recommendedLayout: {
    stablePrefix: [
      "[system role and constraints]",
      "[policy and rules]",
      "[tool definitions]",
      "[static examples]",
    ],
    dynamicTail: [
      "[system_prompt_version / template_version]",
      "[user message]",
    ],
  },
  fixPlan: [
    "Priority 1 - support_agent.answer: move system_prompt_version and template_version below the stable prefix; render version-agnostic support policy, tools, and examples first.",
  ],
  dataQuality: {
    hasRenderedPrompts: true,
    hasTokenUsage: false,
    hasCacheReadTelemetry: false,
    hasCacheCreationTelemetry: false,
    hasProviderMetadata: true,
    hasModelMetadata: false,
    comparableRunGroups: langSmithPrefixDiagnosticRoutes.length,
    warnings: [
      "Token usage data is missing. Waste estimates will be approximate.",
      "Cached-token telemetry missing. Report uses prefix-drift estimation only.",
      "Model metadata missing. Cost estimates may be less accurate.",
    ],
    confidenceReasons: [
      "Rendered prompts found.",
      "Token usage missing.",
      "Cache-read telemetry missing.",
      "Cache-creation telemetry missing.",
      "Provider metadata found.",
      "Model metadata missing.",
      `${langSmithPrefixDiagnosticRoutes.length} comparable route group(s) found.`,
    ],
  },
  details: {
    reportMode: "prefix_diagnostic",
    diagnosisConfidence: "medium",
    moneyConfidence: "low",
    pricingConfidence: "low",
    targetCacheReadRate: "35-70%",
    projectedMonthlyRuns: lsPrefixDxProjectedMonthlyRuns,
    projectionFormula: `${lsPrefixDxRunsAnalyzed.toLocaleString("en-US")} * 30 / 7 = ${lsPrefixDxProjectedMonthlyRuns.toLocaleString("en-US")}`,
    missedReusableTokensPerRun: Math.round(
      lsPrefixDxWindowMissedReusableTokens / Math.max(1, lsPrefixDxRunsAnalyzed)
    ),
    windowMissedReusableTokens: lsPrefixDxWindowMissedReusableTokens,
    windowMissedReusableTokensFormula: `${lsPrefixDxRunsAnalyzed.toLocaleString("en-US")} * ${Math.round(
      lsPrefixDxWindowMissedReusableTokens / Math.max(1, lsPrefixDxRunsAnalyzed)
    ).toLocaleString("en-US")} = ${lsPrefixDxWindowMissedReusableTokens.toLocaleString("en-US")}`,
    projectedMonthlyMissedReusableTokens: lsPrefixDxProjectedMonthlyMissedReusableTokens,
    monthlyMissedReusableTokensFormula: `${lsPrefixDxWindowMissedReusableTokens.toLocaleString("en-US")} * 30 / 7 = ${lsPrefixDxProjectedMonthlyMissedReusableTokens.toLocaleString("en-US")}`,
    pricingBasis: "model metadata missing or unknown; pricing was not applied",
    fastestFirstFix: "move system_prompt_version / template_version out of the prefix",
    credibilityReason:
      "rendered prompts, token usage missing, cached-token telemetry missing.",
    savingsAccuracyNote:
      "Money estimate unavailable / low confidence. Prompt structure issue detected. Enable token usage, cached-token telemetry, and known model pricing to calculate finance-grade savings.",
    telemetryDocsUrl: "https://docs.smith.langchain.com/observability",
    routeDiagnostics: langSmithPrefixDiagnosticRoutes.map((route) => ({
      route: route.route,
      model: route.model,
      monthlyRecoverableLossUsd: 0,
      avgInputTokens: route.avgInputTokens,
      observedCacheReadRate: null,
      expectedCacheReadRate: "35%",
      firstDivergenceToken: route.firstDivergenceToken,
      mainIssue: route.issue,
      detectedFields: route.fields,
      cause: route.cause,
      sourceLocation: route.sourceLocation,
      evidence: route.evidence,
      whyItHurts: {
        human: route.whyHuman,
        technical: route.whyTechnical,
      },
      whatToChange: route.whatToChange,
      agentInstruction: route.agentInstruction,
      validation: {
        command:
          'npx --yes cachecatch audit "Northstar AI Support Triage" --provider langsmith --window 24h',
        successCriteria: route.successCriteria,
      },
    })),
  },
}

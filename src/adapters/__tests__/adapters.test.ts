/**
 * Adapter unit tests.
 *
 * Tests normalize-* functions (pure) and the mock adapter contract.
 * Network tests are skipped in CI but the HTTP plumbing is verified
 * via direct client instantiation.
 */

import {
  normalizeLangSmithRun,
  LangSmithClient,
} from "../langsmith.ts"
import { normalizeLangfuseObservation } from "../langfuse.ts"
import { normalizeBraintrustSpan } from "../braintrust.ts"
import {
  mockAdapter,
  buildMockTraces,
  resetMockTraces,
} from "../mock.ts"
import { ADAPTERS } from "../index.ts"

let pass = 0
let fail = 0
function assert(cond: boolean, msg: string): void {
  if (cond) {
    pass++
    console.log(`  \u001b[32m✔\u001b[0m ${msg}`)
  } else {
    fail++
    console.log(`  \u001b[31m✗\u001b[0m ${msg}`)
  }
}

console.log("\n\u001b[1mAdapter registry\u001b[0m")
assert(typeof ADAPTERS.langsmith === "object", "langsmith adapter registered")
assert(typeof ADAPTERS.langfuse === "object", "langfuse adapter registered")
assert(typeof ADAPTERS.braintrust === "object", "braintrust adapter registered")
assert(ADAPTERS.langsmith.id === "langsmith", "langsmith adapter has correct id")
assert(ADAPTERS.langfuse.id === "langfuse", "langfuse adapter has correct id")
assert(ADAPTERS.braintrust.id === "braintrust", "braintrust adapter has correct id")

console.log("\n\u001b[2mMock adapter\u001b[0m")
resetMockTraces()
const mockTraces = buildMockTraces()
assert(mockTraces.length > 0, "mock adapter generates traces")
assert(
  mockTraces.every((t) => t.provider === "langsmith" || t.provider === "mock"),
  "mock traces have valid provider"
)
assert(
  mockTraces.every((t) => t.promptText.length > 0),
  "mock traces have non-empty promptText"
)
assert(
  mockTraces.every((t) => Array.isArray(t.messages) && t.messages.length > 0),
  "mock traces have messages"
)

void (async () => {
  const result = await mockAdapter.fetchTraces({
    project: "Test",
    apiKey: "",
    window: "7d",
    limit: 50,
  })
  assert(result.traces.length > 0, "mockAdapter.fetchTraces returns traces")
  assert(result.projectName === "Test", "mockAdapter returns project name")

  console.log("\n\u001b[2mLangSmith normalizer\u001b[0m")
  const lsTrace = normalizeLangSmithRun({
    id: "run-1",
    trace_id: "trace-1",
    name: "support_agent.answer",
    run_type: "llm",
    inputs: {
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "How do I reset my password?" },
      ],
    },
    outputs: {
      llm_output: { token_usage: { prompt_tokens: 120, completion_tokens: 60 } },
    },
    extra: {
      metadata: { ls_provider: "openai", ls_model_name: "gpt-4o" },
      invocation_params: { model: "gpt-4o" },
    },
    usage_metadata: {
      input_tokens: 120,
      output_tokens: 60,
      input_token_details: { cache_read: 30 },
    },
    start_time: "2026-06-29T12:00:00Z",
  })
  assert(lsTrace.provider === "langsmith", "langsmith normalizer sets provider")
  assert(lsTrace.model === "gpt-4o", "langsmith normalizer extracts model")
  assert(lsTrace.route === "llm.support_agent.answer", "langsmith normalizer builds route")
  assert(lsTrace.metrics.totalInputTokens === 120, "langsmith normalizer extracts input tokens")
  assert(lsTrace.metrics.cacheReadTokens === 30, "langsmith normalizer extracts cache read tokens")
  assert(lsTrace.messages.length === 2, "langsmith normalizer extracts messages")

  // Client instantiation
  const client = new LangSmithClient("lsv2_test_key_1234567890", "https://api.example.com")
  assert(
    (client as unknown as { apiKey: string }).apiKey === "lsv2_test_key_1234567890",
    "LangSmith client stores apiKey"
  )

  console.log("\n\u001b[2mLangfuse normalizer\u001b[0m")
  const lfTrace = normalizeLangfuseObservation({
    id: "obs-1",
    traceId: "trace-1",
    type: "GENERATION",
    name: "llm-generation",
    providedModelName: "gpt-4o",
    input: {
      messages: [
        { role: "user", content: "What is 2+2?" },
      ],
    },
    usageDetails: { input: 50, output: 20, total: 70, cacheRead: 10 } as unknown as Record<string, number>,
    costDetails: { total: 0.001 },
    startTime: "2026-06-29T12:00:00Z",
  })
  assert(lfTrace.provider === "langfuse", "langfuse normalizer sets provider")
  assert(lfTrace.model === "gpt-4o", "langfuse normalizer extracts model")
  assert(lfTrace.metrics.totalInputTokens === 50, "langfuse normalizer extracts input tokens")
  assert(lfTrace.metrics.cacheReadTokens === 10, "langfuse normalizer extracts cache read tokens")
  assert(lfTrace.promptText.includes("What is 2+2?"), "langfuse normalizer extracts prompt text")

  console.log("\n\u001b[2mBraintrust normalizer\u001b[0m")
  const btTrace = normalizeBraintrustSpan({
    id: "span-1",
    root_span_id: "trace-1",
    span_attributes: { type: "llm", name: "llm-call" },
    input: {
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Hi" },
      ],
    },
    metadata: { model: "gpt-4o" },
    metrics: {
      prompt_tokens: 200,
      completion_tokens: 80,
      total_tokens: 280,
      prompt_cached_tokens: 40,
      estimated_cost: 0.005,
    },
    created: "2026-06-29T12:00:00Z",
  })
  assert(btTrace.provider === "braintrust", "braintrust normalizer sets provider")
  assert(btTrace.model === "gpt-4o", "braintrust normalizer extracts model")
  assert(btTrace.route === "llm-call", "braintrust normalizer uses span name as route")
  assert(btTrace.metrics.totalInputTokens === 200, "braintrust normalizer extracts input tokens")
  assert(btTrace.metrics.cacheReadTokens === 40, "braintrust normalizer extracts cached tokens")
  assert(btTrace.metrics.costUsd === 0.005, "braintrust normalizer extracts cost")

  console.log("\n\u001b[2mEnd-to-end mock pipeline\u001b[0m")
  const { buildReport } = await import("../../engine/index.ts")
  resetMockTraces()
  const { traces } = await mockAdapter.fetchTraces({
    project: "e2e",
    apiKey: "",
    window: "7d",
    limit: 100,
  })
  const report = buildReport(traces, {
    projectName: "e2e",
    window: "7d",
    source: "mock",
  })
  assert(report.summary.runsAnalyzed > 0, "e2e: traces flow through engine")
  assert(report.routes.length > 0, "e2e: routes are detected")
  assert(report.findings.length > 0, "e2e: findings are generated")
  assert(report.score >= 0 && report.score <= 100, "e2e: score is in range")

  console.log(`\n\u001b[1m${pass} passed, ${fail} failed\u001b[0m\n`)
  process.exit(fail > 0 ? 1 : 0)
})()

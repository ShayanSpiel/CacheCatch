/**
 * Engine unit tests.
 *
 * Run: npx tsx src/engine/__tests__/engine.test.ts
 */

import { buildReport } from "../report-builder.ts"
import { buildLocalAgentAudit } from "../local-agent-audit.ts"
import { comparePrompts } from "../prefix-matcher.ts"
import { detectFindings } from "../detectors.ts"
import { assessDataQuality, calculateReportConfidence, calculateScore } from "../scoring.ts"
import { approximateTokens } from "../tokens.ts"
import type { NormalizedTrace, DataQuality } from "../../types/index.ts"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

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

function makeTrace(overrides: Partial<NormalizedTrace> = {}): NormalizedTrace {
  return {
    traceId: "t-1",
    provider: "langsmith",
    model: "gpt-4o",
    route: "test.route",
    promptText: "Hello world, this is a test prompt with some content that should be stable across runs.",
    messages: [
      { role: "system", content: "Hello world" },
      { role: "user", content: "Hello world, this is a test prompt." },
    ],
    metrics: {
      totalInputTokens: 100,
      totalOutputTokens: 50,
      cacheReadTokens: 10,
      cacheCreationTokens: 20,
      costUsd: 0.001,
      estimatedWasteUsd: 0,
    },
    ...overrides,
  }
}

console.log("\n\u001b[1mEngine tests\u001b[0m")
console.log("\n\u001b[2mtokens.ts\u001b[0m")
assert(approximateTokens("hello") === 2, "approximateTokens of 'hello' is 2")
assert(approximateTokens("hello world") === 3, "approximateTokens of 'hello world' is 3")
assert(approximateTokens(42) === 42, "approximateTokens of number is the number")
assert(approximateTokens("") === 0, "approximateTokens of empty string is 0")

console.log("\n\u001b[2mprefix-matcher.ts\u001b[0m")
const ps1 = comparePrompts([
  "You are a helpful assistant. Answer:",
  "You are a helpful assistant. Question:",
])
assert(ps1 !== null, "comparePrompts returns non-null for 2+ prompts")
assert(
  ps1!.firstDivergenceToken > 0,
  "firstDivergenceToken is positive for divergent prompts"
)

const ps2 = comparePrompts(["identical", "identical", "identical"])
assert(ps2 !== null, "comparePrompts handles identical prompts")
assert(
  ps2!.prefixRatio > 0.5,
  "prefixRatio is high (>0.5) for identical prompts"
)

const ps3 = comparePrompts([])
assert(ps3 === null, "comparePrompts returns null for empty input")

const ps4 = comparePrompts(["only one"])
assert(ps4 === null, "comparePrompts returns null for single prompt")

console.log("\n\u001b[2mdetectors.ts\u001b[0m")
const tWithTs = makeTrace({
  promptText: "You are helpful.\n\n2026-06-29T12:34:56Z\nQuestion?",
})
const findings1 = detectFindings([tWithTs])
assert(
  findings1.some((f) => f.type === "timestamp_in_prefix"),
  "detects timestamp in prompt"
)

const tWithUuid = makeTrace({
  promptText: "stable prefix\nuser_id: 7f3c8a2e-1234-1234-1234-aaaaaaaaaaaa",
})
const findings2 = detectFindings([tWithUuid])
assert(
  findings2.some((f) => f.type === "request_id_in_prefix"),
  "detects UUID in prompt"
)

const tWithMetadata = makeTrace({
  promptText: "userId: usr_abc12345\nsystem prompt",
})
const findings3 = detectFindings([tWithMetadata])
assert(
  findings3.some((f) => f.type === "early_dynamic_metadata"),
  "detects early dynamic metadata"
)

const tClean = makeTrace({
  promptText: "This is a clean system prompt with no dynamic content. " .repeat(20),
})
const findings4 = detectFindings([tClean])
assert(findings4.length === 0, "clean prompt produces no findings")

console.log("\n\u001b[2mscoring.ts\u001b[0m")
const dqHigh: DataQuality = {
  hasRenderedPrompts: true,
  hasTokenUsage: true,
  hasCacheReadTelemetry: true,
  hasCacheCreationTelemetry: true,
  hasProviderMetadata: true,
  hasModelMetadata: true,
  comparableRunGroups: 4,
  warnings: [],
  confidenceReasons: [],
}
assert(calculateReportConfidence(dqHigh) === "high", "high confidence when all data present")

const dqMedium: DataQuality = {
  ...dqHigh,
  hasCacheReadTelemetry: false,
}
assert(calculateReportConfidence(dqMedium) === "medium", "medium confidence when cache telemetry missing")

const dqLow: DataQuality = {
  hasRenderedPrompts: false,
  hasTokenUsage: false,
  hasCacheReadTelemetry: false,
  hasCacheCreationTelemetry: false,
  hasProviderMetadata: false,
  hasModelMetadata: false,
  comparableRunGroups: 0,
  warnings: [],
  confidenceReasons: [],
}
assert(calculateReportConfidence(dqLow) === "low", "low confidence when prompts missing")

const dq2 = assessDataQuality(10, [], {
  hasRenderedPrompts: true,
  hasTokenUsage: true,
  hasCacheReadTelemetry: false,
  hasCacheCreationTelemetry: false,
  hasProviderMetadata: true,
  hasModelMetadata: true,
})
assert(dq2.warnings.length > 0, "assessDataQuality surfaces warnings")

const score1 = calculateScore({
  summary: { observedCacheReadRate: 0.5 },
  findings: [],
  routes: [],
  dataQuality: dqHigh,
})
assert(score1 >= 95, "high cache rate + no findings = high score")

const score2 = calculateScore({
  summary: { observedCacheReadRate: 0.01 },
  findings: [],
  routes: [],
  dataQuality: dqHigh,
})
assert(score2 < score1, "low cache rate = lower score")

console.log("\n\u001b[2mreport-builder.ts\u001b[0m")
const report1 = buildReport([makeTrace(), makeTrace({ traceId: "t-2" })], {
  projectName: "Test",
  window: "7d",
  source: "mock",
})
assert(report1.id.startsWith("report-"), "report id starts with 'report-'")
assert(report1.summary.runsAnalyzed === 2, "summary counts runs correctly")
assert(report1.routes.length === 1, "summary has 1 route group")
assert(report1.score >= 0 && report1.score <= 100, "score is within 0-100")

const report2 = buildReport(
  [makeTrace({ metrics: { totalInputTokens: 100, totalOutputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, estimatedWasteUsd: 0 } })],
  { projectName: "Test", window: "7d", source: "mock" }
)
assert(
  report2.summary.observedCacheReadRate === null,
  "observedCacheReadRate is null when no cache telemetry"
)

const empty = buildReport([], { projectName: "Empty", window: "7d", source: "mock" })
assert(empty.summary.runsAnalyzed === 0, "empty traces → runsAnalyzed=0")
assert(empty.findings.length === 0, "empty traces → no findings")

console.log("\n\u001b[2mlocal-agent telemetry\u001b[0m")
const oldHome = process.env.CACHECATCH_TEST_HOME
const tmpHome = mkdtempSync(join(tmpdir(), "cachecatch-local-"))
try {
  process.env.CACHECATCH_TEST_HOME = tmpHome
  const codexDir = join(tmpHome, ".codex", "sessions")
  const claudeDir = join(tmpHome, ".cachecatch", "telemetry", "claude-code")
  mkdirSync(codexDir, { recursive: true })
  mkdirSync(claudeDir, { recursive: true })

  writeFileSync(join(codexDir, "cumulative.jsonl"), [
    JSON.stringify({ type: "event_msg", payload: { type: "token_count", token_count: { input_tokens: 1000, cached_input: 200, output_tokens: 100 }, turn_context: { model: "gpt-5-codex" } }, session_id: "s1" }),
    JSON.stringify({ type: "event_msg", payload: { type: "token_count", token_count: { input_tokens: 2500, cached_input: 900, output_tokens: 250 }, turn_context: { model: "gpt-5-codex" } }, session_id: "s1" }),
  ].join("\n"), "utf-8")

  writeFileSync(join(codexDir, "per-turn.jsonl"), [
    JSON.stringify({ type: "event_msg", payload: { type: "token_count", token_count: { input_tokens: 300, cached_input_tokens: 30, output_tokens: 20 }, turn_context: { model: "gpt-5-codex" } }, session_id: "s2" }),
    JSON.stringify({ type: "event_msg", payload: { type: "token_count", token_count: { input_tokens: 200, cached_input_tokens: 25, output_tokens: 10 }, turn_context: { model: "gpt-5-codex" } }, session_id: "s2" }),
  ].join("\n"), "utf-8")

  writeFileSync(join(codexDir, "otel.jsonl"), JSON.stringify({
    event: "response.completed",
    response: { usage: { input_tokens: 700, output_tokens: 70, input_tokens_details: { cached_tokens: 350 } } },
    model: "gpt-5-codex",
    session_id: "s3",
  }), "utf-8")

  writeFileSync(join(claudeDir, "api.jsonl"), JSON.stringify({
    event: "claude_code.api_request",
    input_tokens: 1000,
    output_tokens: 100,
    cache_read_tokens: 600,
    cache_creation_tokens: 200,
    cost_usd: 0.42,
    model: "claude-sonnet-4",
    session: { id: "c1" },
  }), "utf-8")

  writeFileSync(join(claudeDir, "metrics.jsonl"), [
    JSON.stringify({ name: "claude_code.token.usage", token_type: "input", value: 100 }),
    JSON.stringify({ name: "claude_code.token.usage", token_type: "output", value: 10 }),
    JSON.stringify({ name: "claude_code.token.usage", token_type: "cacheRead", value: 50 }),
    JSON.stringify({ name: "claude_code.token.usage", token_type: "cacheCreation", value: 25 }),
  ].join("\n"), "utf-8")

  const localReport = buildLocalAgentAudit({ window: "1y", now: new Date(), redact: true })
  const codex = localReport.agents.find((agent) => agent.provider === "codex")
  const claude = localReport.agents.find((agent) => agent.provider === "claude-code")
  assert(codex?.visibility === "exact_cache_telemetry", "Codex cache/token fields upgrade to exact telemetry")
  assert((codex?.inputTokens ?? 0) === 2700, "Codex cumulative token_count events are converted to deltas and per-turn events are not subtracted")
  assert((codex?.cacheReadTokens ?? 0) === 1105, "Codex cached_input/cache details are observed")
  assert((codex?.totalTokens ?? 0) < (codex?.inputTokens ?? 0) + (codex?.outputTokens ?? 0) + (codex?.cacheReadTokens ?? 0) + 1, "Codex total token activity does not double-count cached input")
  assert(claude?.visibility === "exact_cache_telemetry", "Claude Code OTel api_request/metrics produce exact telemetry")
  assert((claude?.cacheReadTokens ?? 0) === 650, "Claude Code cacheRead tokens aggregate")
  assert((claude?.cacheWriteTokens ?? 0) === 225, "Claude Code cacheCreation tokens aggregate")
  assert(claude?.modelCostUsd === 0.42, "Claude Code observed cost is preserved")

  rmSync(tmpHome, { recursive: true, force: true })
  const tmpHome2 = mkdtempSync(join(tmpdir(), "cachecatch-local-transcript-"))
  process.env.CACHECATCH_TEST_HOME = tmpHome2
  const transcriptDir = join(tmpHome2, ".claude", "projects", "repo")
  mkdirSync(transcriptDir, { recursive: true })
  writeFileSync(join(transcriptDir, "session.jsonl"), JSON.stringify({ message: { content: "AGENTS.md\nnpm test\nterminal output" } }), "utf-8")
  const transcriptReport = buildLocalAgentAudit({ window: "1y", now: new Date(), redact: true })
  const transcriptClaude = transcriptReport.agents.find((agent) => agent.provider === "claude-code")
  assert(transcriptClaude?.visibility === "transcript_context_only", "Claude transcript-only fixture stays transcript_context_only")
  assert(transcriptClaude?.cacheReadPercent === null, "Transcript-only cache telemetry is not reported, not zero")
  assert(transcriptReport.summary.cacheReadPercent === null, "Missing cache fields do not invent cache-read percent")
  assert(transcriptReport.summary.modelCostUsd === null, "Missing model/pricing/token basis does not invent cost")
  rmSync(tmpHome2, { recursive: true, force: true })

  const tmpHome3 = mkdtempSync(join(tmpdir(), "cachecatch-local-claude-missing-"))
  process.env.CACHECATCH_TEST_HOME = tmpHome3
  const missingClaudeDir = join(tmpHome3, ".cachecatch", "telemetry", "claude-code")
  mkdirSync(missingClaudeDir, { recursive: true })
  writeFileSync(join(missingClaudeDir, "api.jsonl"), JSON.stringify({
    event: "claude_code.api_request",
    input_tokens: 1000,
    output_tokens: 100,
    model: "claude-sonnet-4",
    session: { id: "missing-cache" },
  }), "utf-8")
  const missingCacheReport = buildLocalAgentAudit({ window: "1y", now: new Date(), redact: true })
  const missingCacheClaude = missingCacheReport.agents.find((agent) => agent.provider === "claude-code")
  assert(missingCacheClaude?.visibility === "token_telemetry_only", "Claude OTel with missing cache fields is token telemetry only")
  assert(missingCacheClaude?.cacheReadPercent === null, "Claude missing cache_read_tokens renders not reported")
  rmSync(tmpHome3, { recursive: true, force: true })

  const tmpHome4 = mkdtempSync(join(tmpdir(), "cachecatch-local-claude-zero-"))
  process.env.CACHECATCH_TEST_HOME = tmpHome4
  const zeroClaudeDir = join(tmpHome4, ".cachecatch", "telemetry", "claude-code")
  mkdirSync(zeroClaudeDir, { recursive: true })
  writeFileSync(join(zeroClaudeDir, "api.jsonl"), JSON.stringify({
    event: "claude_code.api_request",
    input_tokens: 1000,
    output_tokens: 100,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    model: "claude-sonnet-4",
    session: { id: "zero-cache" },
  }), "utf-8")
  const zeroCacheReport = buildLocalAgentAudit({ window: "1y", now: new Date(), redact: true })
  const zeroCacheClaude = zeroCacheReport.agents.find((agent) => agent.provider === "claude-code")
  assert(zeroCacheClaude?.visibility === "exact_cache_telemetry", "Claude explicit zero cache fields are exact cache telemetry")
  assert(zeroCacheClaude?.cacheReadPercent === 0, "Claude explicit cache_read_tokens: 0 renders 0 observed")
  rmSync(tmpHome4, { recursive: true, force: true })
} finally {
  if (oldHome === undefined) delete process.env.CACHECATCH_TEST_HOME
  else process.env.CACHECATCH_TEST_HOME = oldHome
}

console.log(`\n\u001b[1m${pass} passed, ${fail} failed\u001b[0m\n`)
process.exit(fail > 0 ? 1 : 0)

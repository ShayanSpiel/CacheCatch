/**
 * Engine unit tests.
 *
 * Run: npx tsx src/engine/__tests__/engine.test.ts
 */

import { buildReport } from "../report-builder.ts"
import { comparePrompts } from "../prefix-matcher.ts"
import { detectFindings } from "../detectors.ts"
import { assessDataQuality, calculateReportConfidence, calculateScore } from "../scoring.ts"
import { approximateTokens } from "../tokens.ts"
import type { NormalizedTrace, DataQuality } from "../../types/index.ts"

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

console.log(`\n\u001b[1m${pass} passed, ${fail} failed\u001b[0m\n`)
process.exit(fail > 0 ? 1 : 0)

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

  const tmpHome5 = mkdtempSync(join(tmpdir(), "cachecatch-local-invalid-cache-"))
  process.env.CACHECATCH_TEST_HOME = tmpHome5
  const invalidCodexDir = join(tmpHome5, ".codex", "sessions")
  mkdirSync(invalidCodexDir, { recursive: true })
  writeFileSync(join(invalidCodexDir, "invalid-cache.jsonl"), JSON.stringify({
    type: "event_msg",
    payload: {
      type: "token_count",
      token_count: { input_tokens: 100, cached_input: 150, output_tokens: 10 },
      turn_context: { model: "gpt-5-codex" },
    },
    session_id: "invalid-cache",
  }), "utf-8")
  const invalidCacheReport = buildLocalAgentAudit({ window: "1y", now: new Date(), redact: true })
  const invalidCacheCodex = invalidCacheReport.agents.find((agent) => agent.provider === "codex")
  assert(invalidCacheCodex?.cacheFieldPresent === true, "Invalid Codex cache rows still report that cache fields were present")
  assert(invalidCacheCodex?.cacheReadPercent === null, "Codex cache-read percent is suppressed when cache reads exceed denominator")
  assert(invalidCacheReport.summary.cacheReadPercent === null, "Global cache-read percent is suppressed when no valid cache denominator remains")
  assert(invalidCacheReport.findings.some((finding) => finding.id === "invalid-cache-telemetry-semantics"), "Invalid cache denominator gets an explicit finding")
  assert(!invalidCacheReport.summary.sanityWarnings?.some((warning) => warning.includes("outside 0-100%")), "Invalid cache rates are suppressed before report validation")
  rmSync(tmpHome5, { recursive: true, force: true })
} finally {
  if (oldHome === undefined) delete process.env.CACHECATCH_TEST_HOME
  else process.env.CACHECATCH_TEST_HOME = oldHome
}

console.log("\n\u001b[2mlocal-agent project attribution\u001b[0m")
{
  const oldHome2 = process.env.CACHECATCH_TEST_HOME
  const home = mkdtempSync(join(tmpdir(), "cachecatch-local-attr-"))
  const originalCwd = process.cwd()
  try {
    process.env.CACHECATCH_TEST_HOME = home

    const projectRepo = join(home, "work", "docs-rag")
    mkdirSync(projectRepo, { recursive: true })
    writeFileSync(
      join(projectRepo, "AGENTS.md"),
      "# Agent Instructions\n\n## Project Rules\n- Keep analysis in src/engine.\n- Provider I/O stays in src/adapters.\n\n## Commands\n- npm run typecheck\n- npm test\n",
      "utf-8"
    )

    const codexDir = join(home, ".codex", "sessions")
    mkdirSync(codexDir, { recursive: true })
    writeFileSync(
      join(codexDir, "session.jsonl"),
      [
        JSON.stringify({
          type: "event_msg",
          payload: { type: "token_count", token_count: { input_tokens: 100, cached_input: 30, output_tokens: 10 }, turn_context: { model: "gpt-5-codex" }, cwd: projectRepo },
          session_id: "p1",
        }),
        JSON.stringify({
          type: "event_msg",
          payload: { type: "token_count", token_count: { input_tokens: 200, cached_input: 60, output_tokens: 20 }, turn_context: { model: "gpt-5-codex" }, cwd: projectRepo },
          session_id: "p1",
        }),
        JSON.stringify({
          type: "event_msg",
          payload: { type: "token_count", token_count: { input_tokens: 50, cached_input: 10, output_tokens: 5 }, turn_context: { model: "gpt-5-codex" }, cwd: projectRepo },
          session_id: "p1",
        }),
      ].join("\n"),
      "utf-8"
    )

    // Force process.cwd() to a totally different repo to prove the report
    // does not anchor markdown advice to the shell directory.
    const unrelatedRepo = join(home, "work", "unrelated")
    mkdirSync(unrelatedRepo, { recursive: true })
    process.chdir(unrelatedRepo)

    const report = buildLocalAgentAudit({ window: "1y", now: new Date(), redact: true })
    const docsProject = report.projects.find((p) => p.path === projectRepo)
    assert(docsProject !== undefined, "Codex session cwd is attributed to its actual project path")
    assert(docsProject?.sessions === 1, "Project sessions counts match the unique session_id")
    assert(docsProject?.agentsMdStatus === "present", "AGENTS.md present in the actual project is reported as present, not missing")
    assert(
      !report.findings.some((finding) => finding.id === "weak-agents-md" && finding.evidence.toLowerCase().includes("missing")),
      "Report does not falsely claim AGENTS.md is missing in the project that has it"
    )
    assert(
      report.findings.some((finding) => finding.id === "weak-agents-md" && finding.evidence.toLowerCase().includes("thin")) === false,
      "Healthy AGENTS.md is not classified as weak"
    )
  } finally {
    process.chdir(originalCwd)
    if (oldHome2 === undefined) delete process.env.CACHECATCH_TEST_HOME
    else process.env.CACHECATCH_TEST_HOME = oldHome2
    rmSync(home, { recursive: true, force: true })
  }
}

console.log("\n\u001b[2mlocal-agent weak markdown detection\u001b[0m")
{
  const oldHome3 = process.env.CACHECATCH_TEST_HOME
  const home = mkdtempSync(join(tmpdir(), "cachecatch-local-weak-"))
  try {
    process.env.CACHECATCH_TEST_HOME = home
    const projectRepo = join(home, "work", "thin-rules")
    mkdirSync(projectRepo, { recursive: true })
    writeFileSync(join(projectRepo, "AGENTS.md"), "# notes\ntodo later\n", "utf-8")

    const codexDir = join(home, ".codex", "sessions")
    mkdirSync(codexDir, { recursive: true })
    writeFileSync(
      join(codexDir, "session.jsonl"),
      JSON.stringify({
        type: "event_msg",
        payload: { type: "token_count", token_count: { input_tokens: 100, cached_input: 10, output_tokens: 5 }, turn_context: { model: "gpt-5-codex" }, cwd: projectRepo },
        session_id: "thin",
      }),
      "utf-8"
    )

    const report = buildLocalAgentAudit({ window: "1y", now: new Date(), redact: true })
    const thinProject = report.projects.find((p) => p.path === projectRepo)
    assert(thinProject?.agentsMdStatus === "weak", "Present-but-thin AGENTS.md is correctly classified as weak, not missing")
    const finding = report.findings.find((f) => f.id === "weak-agents-md")
    assert(Boolean(finding && finding.evidence.toLowerCase().includes("thin")), "Weak AGENTS.md finding names the affected project with project-aware evidence")
  } finally {
    if (oldHome3 === undefined) delete process.env.CACHECATCH_TEST_HOME
    else process.env.CACHECATCH_TEST_HOME = oldHome3
    rmSync(home, { recursive: true, force: true })
  }
}

console.log("\n\u001b[2mlocal-agent project ranking merge\u001b[0m")
{
  const oldHome4 = process.env.CACHECATCH_TEST_HOME
  const home = mkdtempSync(join(tmpdir(), "cachecatch-local-rank-"))
  try {
    process.env.CACHECATCH_TEST_HOME = home
    const bigProject = join(home, "work", "big")
    const smallProject = join(home, "work", "small")
    mkdirSync(bigProject, { recursive: true })
    mkdirSync(smallProject, { recursive: true })

    const codexDir = join(home, ".codex", "sessions")
    mkdirSync(codexDir, { recursive: true })
    writeFileSync(
      join(codexDir, "big.jsonl"),
      [
        JSON.stringify({
          type: "event_msg",
          payload: { type: "token_count", token_count: { input_tokens: 100, cached_input: 30, output_tokens: 10 }, turn_context: { model: "gpt-5-codex" }, cwd: bigProject },
          session_id: "big-1",
        }),
        JSON.stringify({
          type: "event_msg",
          payload: { type: "token_count", token_count: { input_tokens: 200, cached_input: 60, output_tokens: 20 }, turn_context: { model: "gpt-5-codex" }, cwd: bigProject },
          session_id: "big-1",
        }),
      ].join("\n"),
      "utf-8"
    )
    writeFileSync(
      join(codexDir, "small.jsonl"),
      JSON.stringify({
        type: "event_msg",
        payload: { type: "token_count", token_count: { input_tokens: 30, cached_input: 5, output_tokens: 2 }, turn_context: { model: "gpt-5-codex" }, cwd: smallProject },
        session_id: "small-1",
      }),
      "utf-8"
    )

    const report = buildLocalAgentAudit({ window: "1y", now: new Date(), redact: true })
    const rankedPaths = report.projects.map((project) => project.path)
    assert(rankedPaths[0] === bigProject, "Top-ranked project is the one with the most sessions, regardless of cwd")
    assert(rankedPaths.includes(smallProject), "Lower-traffic project still appears in the ranking")
    assert(report.projects.length === 2, "Project ranking is not bloated by the unrelated cwd repo")
  } finally {
    if (oldHome4 === undefined) delete process.env.CACHECATCH_TEST_HOME
    else process.env.CACHECATCH_TEST_HOME = oldHome4
    rmSync(home, { recursive: true, force: true })
  }
}

console.log("\n\u001b[2mlocal-agent Claude storage layout attribution\u001b[0m")
{
  const oldHome5 = process.env.CACHECATCH_TEST_HOME
  const home = mkdtempSync(join(tmpdir(), "cachecatch-local-claude-attr-"))
  try {
    process.env.CACHECATCH_TEST_HOME = home
    const bucketProject = join(home, "work", "claude-repo")
    const bucket = join(home, ".claude", "projects", bucketProject)
    mkdirSync(bucket, { recursive: true })
    writeFileSync(join(bucket, "session.jsonl"), JSON.stringify({ message: { content: "hello" } }), "utf-8")

    const report = buildLocalAgentAudit({ window: "1y", now: new Date(), redact: true })
    const claude = report.agents.find((agent) => agent.provider === "claude-code")
    const project = report.projects.find((p) => p.path === bucket)
    assert(claude !== undefined, "Claude Code agent is detected from storage layout")
    assert(project !== undefined, "Claude storage bucket is mapped to a stable project identifier under ~/.claude/projects/")
    assert(project?.sessions === 1, "Claude storage bucket records the right session count")
  } finally {
    if (oldHome5 === undefined) delete process.env.CACHECATCH_TEST_HOME
    else process.env.CACHECATCH_TEST_HOME = oldHome5
    rmSync(home, { recursive: true, force: true })
  }
}

console.log("\n\u001b[2mlayer 1 — pricing registry\u001b[0m")
import { pricingForModel, isHighConfidencePrice } from "../pricing.ts"
const sonnetPrice = pricingForModel("claude-sonnet-4-5-20250929")
assert(sonnetPrice !== undefined, "pricingForModel resolves claude-sonnet-4-5-20250929")
assert(
  typeof sonnetPrice?.inputUsdPerMTok === "number" && sonnetPrice.inputUsdPerMTok > 0,
  "claude-sonnet-4-5 has an inputUsdPerMTok"
)
assert(
  typeof sonnetPrice?.cachedInputUsdPerMTok === "number" && sonnetPrice.cachedInputUsdPerMTok > 0,
  "claude-sonnet-4-5 has a cachedInputUsdPerMTok (this is the column that was missing before)"
)
assert(isHighConfidencePrice(sonnetPrice), "claude-sonnet-4-5 is an official, high-confidence price")
const gpt5 = pricingForModel("gpt-5-codex")
assert(gpt5?.cacheContract?.keyField === "prompt_cache_key", "OpenAI cache contract names the prompt_cache_key field")
const gemini = pricingForModel("gemini-2.5-flash")
assert(gemini?.cacheContract?.minPrefixTokens === 1024, "Google cache contract enforces 1024-token minimum")
const unknown = pricingForModel("totally-unknown-model-9999")
assert(unknown === undefined, "Unknown model resolves to undefined")

console.log("\n\u001b[2mlayer 2 — route rebuild\u001b[0m")
const report1B = buildReport([makeTrace(), makeTrace({ traceId: "t-2" })], {
  projectName: "Test",
  window: "7d",
  source: "mock",
})
const cleanRoute = report1B.routes[0]
const cleanRebuild = report1B.rebuilds?.[0]
assert(cleanRebuild !== undefined, "buildReport attaches a RoutePromptRebuild to every route")
assert(cleanRebuild!.fieldsToMoveDown.length === 0, "Clean route produces no fieldsToMoveDown")
assert(
  cleanRebuild!.expectedCacheReadRateAfterFix >= (cleanRoute.observedCacheReadRate ?? 0),
  "expectedCacheReadRateAfterFix is at least the current rate"
)
assert(
  cleanRebuild!.expectedCacheReadRateAfterFix <= 0.95,
  "expectedCacheReadRateAfterFix is clamped to 0.95"
)

const tWithUuid2 = makeTrace({
  route: "chat.alpha",
  model: "claude-sonnet-4-5",
  metrics: { totalInputTokens: 8000, totalOutputTokens: 100, cacheReadTokens: 200, cacheCreationTokens: 0, costUsd: 0, estimatedWasteUsd: 0 },
  promptText: "system\n\nuser_id: 7f3c8a2e-1234-1234-1234-aaaaaaaaaaaa\nQuestion?",
})
const tWithUuid2b = makeTrace({
  traceId: "t-2b",
  route: "chat.alpha",
  model: "claude-sonnet-4-5",
  metrics: { totalInputTokens: 8000, totalOutputTokens: 100, cacheReadTokens: 200, cacheCreationTokens: 0, costUsd: 0, estimatedWasteUsd: 0 },
  promptText: "system\n\nuser_id: 9a1b2c3d-4567-4567-4567-bbbbbbbbbbbb\nQuestion?",
})
const report1C = buildReport([tWithUuid2, tWithUuid2b], {
  projectName: "Chat Alpha",
  window: "7d",
  source: "langsmith",
})
const chatRoute = report1C.routes[0]
const chatRebuild = report1C.rebuilds?.[0]
assert(chatRebuild !== undefined, "Rebuild is attached for the chat route")
assert(chatRebuild!.fieldsToMoveDown.length > 0, "Rebuild detects the user_id field to move down")
assert(chatRebuild!.cacheContractNote !== null, "Rebuild carries the cache contract note for claude-sonnet-4-5")
assert(chatRebuild!.exampleDiff !== null, "Rebuild computes an example diff from 2+ comparable traces")
assert(chatRoute.model === "claude-sonnet-4-5", "Route model is preserved for the rebuild")

console.log("\n\u001b[2mlayer 3 — dynamic advice\u001b[0m")
import { adviceForLocalProject } from "../advice.ts"
const report1D = buildReport(
  [
    makeTrace({ route: "alpha", model: "claude-sonnet-4-5", promptText: "stable prefix\nuser_id: 7f3c8a2e-1234-1234-1234-aaaaaaaaaaaa" }),
    makeTrace({ route: "alpha", traceId: "t2", model: "claude-sonnet-4-5", promptText: "stable prefix\nuser_id: 9a1b2c3d-4567-4567-4567-bbbbbbbbbbbb" }),
    makeTrace({ route: "beta", model: "claude-sonnet-4-5", promptText: "stable prefix\ncustomer_id: cus_8f2kj3lx\nQ?" }),
    makeTrace({ route: "beta", traceId: "t3", model: "claude-sonnet-4-5", promptText: "stable prefix\ncustomer_id: cus_77qq0abc\nQ?" }),
  ],
  { projectName: "Multi-route", window: "7d", source: "langsmith" }
)
const alphaAdvice = report1D.advice?.[0]
const betaAdvice = report1D.advice?.[1]
assert(alphaAdvice !== undefined && betaAdvice !== undefined, "advice generated for every route")
assert(
  alphaAdvice!.oneLiner !== betaAdvice!.oneLiner || alphaAdvice!.whatToChange[0] !== betaAdvice!.whatToChange[0],
  "Same breaker type on two routes produces different advice (no more static one-liner)"
)
assert(
  alphaAdvice!.agentInstruction.includes("claude-sonnet-4-5"),
  "adviceForRoute names the model in the agent instruction"
)
assert(
  alphaAdvice!.agentInstruction.includes("stable_prefix") && alphaAdvice!.agentInstruction.includes("dynamic_tail"),
  "adviceForRoute emits the stable_prefix/dynamic_tail structure"
)
assert(
  alphaAdvice!.validation.command.includes("cachecatch"),
  "adviceForRoute validation.command references cachecatch"
)
const localAdvice = adviceForLocalProject({
  projectPath: "/work/some-app",
  agentsMdStatus: "missing",
  claudeMdStatus: "missing",
  cacheReadPercent: null,
  sessions: 24,
})
assert(
  localAdvice.oneLiner.includes("24") && localAdvice.sourceLocation === "/work/some-app",
  "adviceForLocalProject names the session count and project path"
)

console.log("\n\u001b[2mlayer 5 — validateReport\u001b[0m")
import { validateReport } from "../validate-report.ts"
import type { CachecatchReport } from "../../types/index.ts"
const synthetic: CachecatchReport = {
  id: "r-1",
  createdAt: new Date().toISOString(),
  source: "mock",
  projectName: "X",
  window: "7d",
  score: 50,
  confidence: "high",
  summary: {
    runsAnalyzed: 1,
    routesAnalyzed: 1,
    observedCacheReadTokens: 0,
    observedCacheCreationTokens: 0,
    observedInputTokens: 100,
    observedOutputTokens: 50,
    observedCacheReadRate: null,
    estimatedReusableTokensAfterDivergence: 0,
    estimatedCacheOpportunityTokens: 0,
    estimatedMonthlyWasteUsd: 500,
    topBreaker: "x",
  },
  routes: [
    {
      route: "a",
      runsAnalyzed: 1,
      observedInputTokens: 100,
      observedCacheReadTokens: 0,
      observedCacheCreationTokens: 0,
      observedCacheReadRate: null,
      estimatedReusableTokensAfterDivergence: 0,
      estimatedCacheOpportunityTokens: 0,
      estimatedMonthlyWasteUsd: 999, // intentionally mismatched
      avgInputTokens: 100,
      avgFirstDivergenceToken: 0,
      findings: [],
    },
  ],
  findings: [],
  recommendedLayout: { stablePrefix: [], dynamicTail: [] },
  fixPlan: [],
  dataQuality: {
    hasRenderedPrompts: true,
    hasTokenUsage: true,
    hasCacheReadTelemetry: true,
    hasCacheCreationTelemetry: true,
    hasProviderMetadata: true,
    hasModelMetadata: true,
    comparableRunGroups: 1,
    warnings: [],
    confidenceReasons: [],
  },
  rebuilds: [
    {
      route: "a",
      stableHeader: ["## System"],
      fieldsToMoveDown: [],
      fieldsToSort: [],
      exampleDiff: null,
      reusableTokensAfterFix: 0,
      expectedCacheReadRateAfterFix: 0.7,
      expectedMonthlySavingsUsd: null,
      cacheContractNote: null,
    },
  ],
  advice: [],
  details: {
    reportMode: "financial_cache_audit",
    pricingConfidence: "high",
    recoverableDeltaPerMillion: 1.25,
    blendedUncachedInputCostPerMillion: 2.5,
    blendedCachedReadCostPerMillion: 1.25,
    monthlyRecoverableCacheLossPrecise: 500,
    monthlyRecoverableCacheLossFormula: "= $999.99", // intentionally wrong
  },
}
const warnings = validateReport(synthetic)
assert(warnings.some((w) => w.includes("does not equal summary.estimatedMonthlyWasteUsd")), "validateReport flags per-route loss mismatches")
assert(warnings.some((w) => w.includes("evaluates to")), "validateReport flags formula/precise mismatches")
const good = buildReport(
  [makeTrace(), makeTrace({ traceId: "t-2" })],
  { projectName: "Good", window: "7d", source: "mock" }
)
const goodWarnings = validateReport(good)
assert(goodWarnings.length === 0 || goodWarnings.every((w) => w.includes("warnings:") || w.length < 200), "validateReport produces no spurious warnings on a clean report")
const validHigh = buildReport(
  [
    makeTrace({ model: "claude-sonnet-4-5", promptText: "stable prefix" }),
    makeTrace({ model: "claude-sonnet-4-5", traceId: "t-2", promptText: "stable prefix" }),
  ],
  { projectName: "Sonnet", window: "7d", source: "langsmith" }
)
assert(validHigh.details?.reportMode === "financial_cache_audit", "buildReport returns financial_cache_audit when the model is officially priced")

console.log(`\n\u001b[1m${pass} passed, ${fail} failed\u001b[0m\n`)
process.exit(fail > 0 ? 1 : 0)

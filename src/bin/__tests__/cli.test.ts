import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  sampleReport,
  langSmithPrefixDiagnosticReport,
} from "../../../lib/cachecatch/sample-data.ts"
import { buildReport } from "../../engine/index.ts"
import { renderTerminalReport } from "../../reporting/index.ts"
import type { NormalizedTrace } from "../../types/index.ts"

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

function run(
  args: string[],
  opts: { timeoutMs?: number } = {}
): { code: number; stdout: string; stderr: string; timedOut: boolean } {
  const res = spawnSync(process.execPath, ["dist/index.js", ...args], {
    cwd: process.cwd(),
    encoding: "utf-8",
    env: {
      ...process.env,
      NO_COLOR: "",
    },
    timeout: opts.timeoutMs ?? 30000,
  })
  return {
    code: res.status ?? 1,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
    timedOut: res.signal === "SIGTERM",
  }
}

function hasAnsi(text: string): boolean {
  return /\u001b\[[0-9;]*m/.test(text)
}

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, "")
}

console.log("\n\u001b[1mCLI tests\u001b[0m")

const sample = run(["sample", "--no-color"])
assert(sample.code === 0, "sample exits 0")
assert(sample.stdout.includes("RECOVERABLE CACHE SAVINGS"), "sample report renders financial hero")
assert(sample.stdout.includes("$15,000"), "$15,000 sample estimate renders")
assert(sample.stdout.includes("enterprise workload example"), "sample report still shows enterprise demo note")
assert(!sample.stdout.includes("FULL AGENT REPAIR PROMPT"), "default sample output hides full agent prompt")
assert(
  sample.stdout.includes("npx --yes cachecatch@latest share --handle @yourname"),
  "post-run summary shows the share command on its own line"
)
assert(
  sample.stdout.includes("--yes flag is required"),
  "post-run summary warns that --yes is required to skip npx's install prompt"
)

const compact = run(["sample", "--compact", "--no-color"])
assert(compact.code === 0, "sample --compact exits 0")
assert(compact.stdout.includes("Fastest Payback"), "compact mode renders compact summary")
assert(!compact.stdout.includes("ROUTE DIAGNOSTIC"), "compact mode omits route diagnostics")

const full = run(["sample", "--full", "--no-color"])
assert(full.code === 0, "sample --full exits 0")
assert(full.stdout.includes("ROUTE DIAGNOSTIC: support_agent.answer"), "full mode includes route diagnostics")
assert(full.stdout.includes("FULL AGENT REPAIR PROMPT"), "full mode includes full agent prompt")

const noColor = run(["sample", "--compact", "--no-color"])
assert(!hasAnsi(noColor.stdout + noColor.stderr), "--no-color output has no ANSI color codes")

const math = run(["sample", "--explain-math", "--no-color"])
assert(math.code === 0, "sample --explain-math exits 0")
assert(math.stdout.includes("56,000 * 8,170 = 457,520,000"), "explain-math includes window token formula")
assert(math.stdout.includes("1,960.8M * $7.65 / 1M = $15,000.12"), "explain-math includes dollar formula")

const json = run(["sample", "--json", "--no-color"])
assert(json.code === 0, "sample --json exits 0")
let parsed: typeof sampleReport | null = null
try {
  parsed = JSON.parse(json.stdout) as typeof sampleReport
} catch {
  parsed = null
}
assert(parsed !== null, "sample --json prints clean JSON")
assert(parsed?.summary.estimatedMonthlyWasteUsd === 15000, "$15,000 sample math is pinned")

const routeLoss = sampleReport.routes.reduce(
  (sum, route) => sum + route.estimatedMonthlyWasteUsd,
  0
)
assert(routeLoss === sampleReport.summary.estimatedMonthlyWasteUsd, "route totals sum to report total")

const longRoute = "agent.with.an.extremely.long.raw.route.identity.that.must.not.be.renamed"
const stableBlock = `${"Stable policy and tool instructions. ".repeat(5000)}`
const realTraces: NormalizedTrace[] = [
  {
    traceId: "real-1",
    provider: "langsmith",
    model: "gpt-4o-mini",
    route: longRoute,
    messages: [{ role: "system", content: `request_id: req_alpha\n${stableBlock}` }],
    promptText: `request_id: req_alpha\n${stableBlock}`,
    metrics: {
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      costUsd: 0,
      estimatedWasteUsd: 0,
    },
  },
  {
    traceId: "real-2",
    provider: "langsmith",
    model: "gpt-4o-mini",
    route: longRoute,
    messages: [{ role: "system", content: `request_id: req_beta\n${stableBlock}` }],
    promptText: `request_id: req_beta\n${stableBlock}`,
    metrics: {
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      costUsd: 0,
      estimatedWasteUsd: 0,
    },
  },
  {
    traceId: "zero-1",
    provider: "langsmith",
    model: "gpt-4o-mini",
    route: "zero_value.route",
    messages: [{ role: "system", content: "stable short prompt" }],
    promptText: "stable short prompt",
    metrics: {
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      costUsd: 0,
      estimatedWasteUsd: 0,
    },
  },
]
const realReport = buildReport(realTraces, {
  projectName: "actual-project",
  source: "langsmith",
  window: "7d",
  createdAt: "2026-07-01T00:00:00Z",
  id: "real-regression",
})
const realDefault = stripAnsi(renderTerminalReport(realReport))
const realFull = stripAnsi(renderTerminalReport(realReport, { full: true }))
assert(!realDefault.includes("enterprise workload example"), "real audit output does not include sample-only language")
assert(!realDefault.includes("support_agent.answer"), "real validation plan does not include sample route names")
assert(realDefault.includes(longRoute), "real diagnostics preserve full raw route identity")
assert(realDefault.includes("agent.with.an.extremely.…"), "long route names are truncated in tables")
assert(realDefault.includes("Money confidence") && realDefault.includes("LOW"), "missing token usage lowers money confidence")
assert(realDefault.includes("REPORT MODE: PREFIX DIAGNOSTIC"), "missing telemetry switches to prefix diagnostic mode")
assert(realDefault.includes("SAVINGS NOT PROVABLE YET"), "diagnostic mode does not lead with fake savings")
assert(realDefault.includes("Current cache-read") && realDefault.includes("not reported"), "missing cache telemetry shows cache-read as not reported")
assert(realDefault.includes("First divergence") && realDefault.includes("char 0") && realDefault.includes("approx token ~1"), "character-based divergence is labeled as char plus approximate token")
assert(!realDefault.includes("FULL AGENT REPAIR PROMPT"), "default real output hides full agent prompt")
assert(!realDefault.includes("Top Cache Leaks By Money"), "diagnostic mode does not rank routes by money")
assert(realDefault.includes("TOP PREFIX DRIFT FINDINGS"), "diagnostic mode ranks prefix drift findings")
assert(realDefault.includes("zero_value.route") && realDefault.includes("n/a"), "diagnostic mode shows findings without $0 money framing")
assert(realFull.includes("zero_value.route") && !realFull.includes("$0"), "--full diagnostic output does not frame routes as $0 losses")
assert(realDefault.includes(`${longRoute}:`) && realDefault.includes("money estimate is unavailable"), "agent repair prompt uses actual audited route names without fake money")
assert(!realDefault.includes("* delta ="), "rendered math never falls back to broken generic delta formula")
assert(!realDefault.match(/([0-9,.]+)M \* \$([0-9.]+) \/ 1M = \$([0-9,.]+)/), "diagnostic mode does not render parseable dollar formula")

const invalid = run(["sample", "--not-a-real-flag"])
assert(invalid.code !== 0, "invalid flag exits non-zero")
assert(
  (invalid.stderr + invalid.stdout).includes("unknown option"),
  "invalid flag gives helpful option error"
)

const lsPrefixDx = run(["sample", "--no-color", "--langsmith-prefix-diagnostic"])
assert(lsPrefixDx.code === 0, "langsmith-prefix-diagnostic sample exits 0")
assert(
  lsPrefixDx.stdout.includes("REPORT MODE: PREFIX DIAGNOSTIC"),
  "langsmith-prefix-diagnostic sample runs in prefix diagnostic mode"
)
assert(
  lsPrefixDx.stdout.includes("Northstar AI Support Triage"),
  "langsmith-prefix-diagnostic sample uses the LangSmith project name"
)
assert(
  lsPrefixDx.stdout.includes("Prefix stability"),
  "langsmith-prefix-diagnostic sample renders Prefix stability (not Cache health)"
)
assert(
  !lsPrefixDx.stdout.includes("Cache health"),
  "langsmith-prefix-diagnostic sample never renders Cache health"
)
assert(
  lsPrefixDx.stdout.includes("Token usage missing") &&
    lsPrefixDx.stdout.includes("Cache-read telemetry missing") &&
    lsPrefixDx.stdout.includes("Cache-creation telemetry missing"),
  "data quality uses missing wording for every absent telemetry field"
)
assert(
  !lsPrefixDx.stdout.includes("! Token usage available") &&
    !lsPrefixDx.stdout.includes("! Cache-read telemetry available") &&
    !lsPrefixDx.stdout.includes("! Cache-creation telemetry available"),
  "data quality never pairs a warning icon with 'available' wording"
)
assert(
  lsPrefixDx.stdout.includes("×  [system_prompt_version / template_version]"),
  "BEFORE block renders only the detected dynamic field, not generic placeholders"
)
assert(
  !lsPrefixDx.stdout.includes("[timestamp / request_id / session_id]") &&
    !lsPrefixDx.stdout.includes("[order_id / customer_id / CRM data]") &&
    !lsPrefixDx.stdout.includes("[RAG chunks / search results]"),
  "BEFORE block does not render generic CRM/RAG/timestamp placeholders in prefix diagnostic mode"
)
assert(
  lsPrefixDx.stdout.includes("Cache-read target after fix ~35% estimated"),
  "route diagnostic softens the cache-read target as estimated in prefix diagnostic mode"
)
assert(
  !lsPrefixDx.stdout.includes("Expected after fix"),
  "no render path uses the old 'Expected after fix' wording"
)
assert(
  !lsPrefixDx.stdout.match(/! Model metadata available/),
  "data quality never pairs a warning icon with 'Model metadata available'"
)
assert(
  lsPrefixDx.stdout.includes("! Model metadata missing") ||
    lsPrefixDx.stdout.includes("! Model pricing metadata missing / unmapped"),
  "data quality explicitly flags missing/unmapped model metadata when pricing is not applied"
)

const lsPrefixDxJson = run(["sample", "--no-color", "--langsmith-prefix-diagnostic", "--json"])
let lsPrefixDxParsed: typeof sampleReport | null = null
try {
  lsPrefixDxParsed = JSON.parse(lsPrefixDxJson.stdout) as typeof sampleReport
} catch {
  lsPrefixDxParsed = null
}
assert(lsPrefixDxParsed !== null, "langsmith-prefix-diagnostic --json prints valid JSON")
assert(
  lsPrefixDxParsed?.details?.reportMode === "prefix_diagnostic",
  "langsmith-prefix-diagnostic --json pins reportMode to prefix_diagnostic"
)
assert(
  lsPrefixDxParsed?.summary.estimatedMonthlyWasteUsd === 0,
  "langsmith-prefix-diagnostic --json keeps the money estimate at zero (no telemetry)"
)

assert(
  langSmithPrefixDiagnosticReport.details?.reportMode === "prefix_diagnostic",
  "langSmithPrefixDiagnosticReport is exported and pinned to prefix_diagnostic mode"
)

// ---- Pre-warm: every non-meta command should kick off the background install
//        (or no-op if Chrome is already cached). The CLI must never block on it
//        and must never fail when puppeteer-core's transitive deps are missing.
const meta = run(["--version"])
assert(meta.code === 0, "--version exits 0")
assert(
  !meta.stdout.includes("Pre-warming banner renderer") &&
    !meta.stderr.includes("Pre-warming banner renderer"),
  "--version never prints the pre-warm hint (meta command)"
)

const help = run(["--help"])
assert(help.code === 0, "--help exits 0")
assert(
  !help.stdout.includes("Pre-warming banner renderer") &&
    !help.stderr.includes("Pre-warming banner renderer"),
  "--help never prints the pre-warm hint (meta command)"
)

const sampleAfterMeta = run(["sample", "--no-color", "--instant"])
assert(
  sampleAfterMeta.code === 0,
  "sample after --version still exits 0 (pre-warm must not throw)"
)

// ---- CLI must NOT block on the pre-warm download. With a 12s timeout, a
//        non-meta command (sample/audit/etc) must complete well within that
//        window — the pre-warm is a detached child, not an in-process wait.
const fastExit = run(["sample", "--no-color", "--instant"], { timeoutMs: 12000 })
assert(
  !fastExit.timedOut,
  "sample completes within 12s (pre-warm must NOT block the parent CLI)"
)

const tmp = mkdtempSync(join(tmpdir(), "cachecatch-cli-"))
try {
  const jsonPath = join(tmp, "audit.json")
  const htmlPath = join(tmp, "cachecatch-report.html")
  const jsonOut = run(["sample", "--json", "--no-color"])
  assert(jsonOut.code === 0, "sample JSON for export exits 0")
  writeFileSync(jsonPath, jsonOut.stdout, "utf-8")

  const exported = run([
    "export",
    jsonPath,
    "--format",
    "html",
    "--out",
    htmlPath,
    "--no-color",
  ])
  assert(exported.code === 0, "export command exits 0")
  assert(existsSync(htmlPath), "export command creates expected file")
  const html = readFileSync(htmlPath, "utf-8")
  assert(html.includes("<!doctype html>"), "exported file is HTML")
  assert(html.includes("Cachecatch"), "exported HTML includes product name")
  assert(html.includes("support-card"), "exported HTML includes the support card")
  assert(
    html.includes("audit local --window 7d"),
    "support card points users to the local audit command"
  )
  assert(
    html.includes("npx --yes cachecatch@latest share"),
    "support card points users to the share command"
  )
  assert(
    html.includes("Thank you for choosing CacheCatch"),
    "support card thanks the user"
  )

  const missingInput = run(["export", "--format", "html", "--out", htmlPath, "--no-color"])
  assert(missingInput.code !== 0, "export without input exits non-zero")
  assert(
    (missingInput.stderr + missingInput.stdout).includes("No report JSON provided"),
    "export without input explains the missing report"
  )
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

console.log(`\n\u001b[1m${pass} passed, ${fail} failed\u001b[0m\n`)
process.exit(fail > 0 ? 1 : 0)

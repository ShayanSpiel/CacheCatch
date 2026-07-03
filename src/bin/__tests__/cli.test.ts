import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { sampleReport } from "../../../lib/cachecatch/sample-data.ts"
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

function run(args: string[]): { code: number; stdout: string; stderr: string } {
  const res = spawnSync(process.execPath, ["dist/index.js", ...args], {
    cwd: process.cwd(),
    encoding: "utf-8",
    env: {
      ...process.env,
      NO_COLOR: "",
    },
  })
  return {
    code: res.status ?? 1,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
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

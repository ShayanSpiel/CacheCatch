/**
 * TerminalReport — premium CLI output for prompt-cache audits.
 */

import chalk from "chalk"
import boxen from "boxen"
import type {
  CachecatchReport,
  CachecatchRouteDiagnostic,
  CacheFinding,
  RouteAudit,
  Severity,
} from "../types/index.ts"
import { APP_NAME, APP_VERSION, PROVIDER_LABELS, WINDOW_LABELS } from "../engine/constants.ts"
import {
  formatNumber,
  formatPercent,
  formatTokensShort,
  formatUsd,
  formatUsdPrecise,
  padLeft,
  padRight,
  truncate,
  titleCase,
} from "./format.ts"

export interface TerminalReportOptions {
  full?: boolean
  compact?: boolean
  explainMath?: boolean
  showAgentPrompt?: boolean
}

function getTerminalWidth(): number {
  const cols = process.stdout.columns || 100
  return Math.max(72, Math.min(120, cols))
}

let WIDTH = getTerminalWidth()

export function setTerminalWidth(width: number): void {
  WIDTH = Math.max(72, Math.min(120, width))
}

const brand = chalk.hex("#74f59a")

const C = {
  heading: chalk.whiteBright.bold,
  brand,
  brandBold: brand.bold,
  muted: chalk.gray,
  dim: chalk.dim,
  good: brand,
  warn: chalk.yellowBright,
  bad: chalk.redBright,
  badBold: chalk.redBright.bold,
  evidence: chalk.cyanBright,
  value: chalk.whiteBright.bold,
  text: chalk.whiteBright,
  rule: chalk.gray,
  code: chalk.whiteBright,
}

const SEV_LABEL: Record<Severity, string> = {
  critical: "× CRITICAL",
  high: "! HIGH",
  medium: "! MEDIUM",
  low: "LOW",
}

function visibleLength(s: string): number {
  return s.replace(/\u001b\[[0-9;]*m/g, "").length
}

function wrapAnsiText(text: string, width: number): string[] {
  if (width <= 0 || visibleLength(text) <= width) return [text]

  const words = text.split(/(\s+)/)
  const lines: string[] = []
  let line = ""

  for (const word of words) {
    if (word.length === 0) continue
    const isWhitespace = /^\s+$/.test(word)
    const normalized = isWhitespace ? " " : word
    const candidate = line.length === 0 || isWhitespace ? `${line}${normalized}` : `${line}${normalized}`

    if (visibleLength(candidate.trimEnd()) <= width) {
      line = candidate
      continue
    }

    if (line.trimEnd().length > 0) lines.push(line.trimEnd())
    line = isWhitespace ? "" : normalized
  }

  if (line.trimEnd().length > 0) lines.push(line.trimEnd())
  return lines.length > 0 ? lines : [text]
}

function wrappedLine(prefix: string, text: string, continuationPrefix = prefix): string {
  const firstWidth = Math.max(12, WIDTH - visibleLength(prefix))
  const nextWidth = Math.max(12, WIDTH - visibleLength(continuationPrefix))
  const firstLines = wrapAnsiText(text, firstWidth)
  const output = [`${prefix}${firstLines[0] ?? ""}`]

  for (const part of firstLines.slice(1)) {
    output.push(`${continuationPrefix}${part}`)
  }

  if (firstLines.length === 1 && visibleLength(output[0]) <= WIDTH) return output[0]

  const rewrapped = [output[0]]
  for (const line of output.slice(1)) {
    if (visibleLength(line) <= WIDTH) {
      rewrapped.push(line)
      continue
    }
    wrapAnsiText(line.slice(continuationPrefix.length), nextWidth).forEach((part) => {
      rewrapped.push(`${continuationPrefix}${part}`)
    })
  }
  return rewrapped.join("\n")
}

function box(
  title: string,
  lines: string[],
  color: "green" | "red" | "yellow" | "cyan" | "gray" | "white" = "gray",
  width = Math.min(WIDTH, 104)
): string {
  const contentWidth = Math.max(20, width - 4)
  const wrappedLines = lines.flatMap((line) =>
    line.length === 0 ? [""] : wrapAnsiText(line, contentWidth)
  )

  return boxen(wrappedLines.join("\n"), {
    title,
    titleAlignment: "left",
    borderStyle: "round",
    borderColor: color,
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    width,
  })
}

function sideBySide(left: string, right: string): string {
  const leftLines = left.split("\n")
  const rightLines = right.split("\n")
  const rows = Math.max(leftLines.length, rightLines.length)
  const leftWidth = Math.max(...leftLines.map((line) => visibleLength(line)))
  const output: string[] = []

  for (let i = 0; i < rows; i++) {
    const l = leftLines[i] ?? ""
    const r = rightLines[i] ?? ""
    output.push(l + " ".repeat(Math.max(2, leftWidth - visibleLength(l) + 2)) + r)
  }

  return output.join("\n")
}

function subsection(title: string): string {
  return `  ${C.muted("┌─")} ${C.heading(title)}`
}

function subitem(label: string, value: string, keyWidth = 30): string {
  const prefix = `  ${C.muted("│")} ${C.muted(padRight(label + ":", keyWidth))} `
  const continuation = `  ${C.muted("│")} ${" ".repeat(keyWidth)} `
  return wrappedLine(prefix, value, continuation)
}

function callout(symbol: string, text: string, color = C.evidence): string {
  return wrappedLine(`  ${color(symbol)} `, text, `    `)
}

function divider(): string {
  return C.rule("─".repeat(WIDTH))
}

function section(title: string): string {
  return C.heading(`■ ${title.toUpperCase()}`)
}

function transition(text: string): string {
  return wrapAnsiText(text, Math.max(24, WIDTH - 2))
    .map((line) => C.dim(`  ${line}`))
    .join("\n")
}

function dimNote(text: string): string {
  return wrapAnsiText(text, Math.max(24, WIDTH - 2))
    .map((line) => C.dim(`  ${line}`))
    .join("\n")
}

function routeSection(title: string): string {
  return C.heading(`■ ${title}`)
}

function scoreBar(score: number): string {
  const width = 20
  const filled = Math.round((Math.max(0, Math.min(100, score)) / 100) * width)
  const color = score >= 70 ? C.good : score >= 40 ? C.warn : C.bad
  return color("█".repeat(filled)) + C.muted("░".repeat(width - filled))
}

function severity(score: number): string {
  if (score < 30) return C.badBold("× CRITICAL")
  if (score < 55) return C.warn("! NEEDS ATTENTION")
  return C.good("✔ HEALTHY")
}

function sourceLabel(report: CachecatchReport): string {
  if (report.source === "sample") return "Sample Enterprise Trace Set"
  return PROVIDER_LABELS[report.source] || titleCase(report.source)
}

function targetRate(report: CachecatchReport): string {
  return report.details?.targetCacheReadRate ?? "35-70%"
}

function fastestFix(report: CachecatchReport): string {
  return (
    report.details?.fastestFirstFix ??
    firstDiagnostic(report)?.whatToChange[0] ??
    report.fixPlan[0] ??
    "move volatile request data below the stable prefix"
  )
}

function displayConfidence(confidence: string | undefined): string {
  if (confidence === "high") return C.good("HIGH")
  if (confidence === "medium") return C.warn("MEDIUM")
  return C.bad("LOW")
}

function moneyConfidenceLabel(report: CachecatchReport): string {
  const confidence = report.details?.moneyConfidence ?? report.confidence
  if (confidence === "high") return C.good("high confidence")
  if (confidence === "medium") return C.warn("estimated")
  return C.bad("directional")
}

function telemetryDocsUrl(report: CachecatchReport): string | undefined {
  return report.details?.telemetryDocsUrl
}

function routeTableLabel(route: string, width: number): string {
  return truncate(route, Math.max(8, width - 1))
}

function routeDiagnostics(report: CachecatchReport): CachecatchRouteDiagnostic[] {
  if (report.details?.routeDiagnostics?.length) return report.details.routeDiagnostics
  return report.routes.map((route) => diagnosticFromRoute(route, report))
}

function firstDiagnostic(report: CachecatchReport): CachecatchRouteDiagnostic | undefined {
  return routeDiagnostics(report)[0]
}

function diagnosticFromRoute(
  route: RouteAudit,
  report: CachecatchReport
): CachecatchRouteDiagnostic {
  const finding = route.findings[0]
  const detectedFields = fieldsForFinding(finding)
  const issue =
    finding?.title ??
    "The route appears to diverge before the reusable prompt prefix is exhausted."
  return {
    route: route.route,
    model: route.model,
    monthlyRecoverableLossUsd: route.estimatedMonthlyWasteUsd,
    avgInputTokens: route.avgInputTokens,
    observedCacheReadRate: route.observedCacheReadRate,
    expectedCacheReadRate: expectedRateForRoute(route),
    firstDivergenceToken:
      finding?.firstDivergenceToken ?? route.avgFirstDivergenceToken,
    mainIssue: issue.endsWith(".") ? issue : `${issue}.`,
    detectedFields,
    cause: causeForFinding(finding),
    evidence: {
      traceId: finding?.evidence.match(/(?:Trace|Run|trace|run)[ #]*([A-Za-z0-9._-]+)/)?.[1] ??
        `${route.route}-sample`,
      changingValue: truncate(finding?.evidence ?? "Rendered prompt diverged early.", 96),
      patternRate: `${route.runsAnalyzed} comparable ${route.route} traces`,
    },
    whyItHurts: {
      human:
        "Repeated instructions are being paid for at full input price because request-specific data appears too early.",
      technical:
        "Prompt caching is prefix-sensitive, so one volatile token before stable instructions can make downstream context miss the cache.",
    },
    whatToChange: specificFixes(finding, route),
    agentInstruction: agentInstructionFor(finding, route),
    validation: {
      command: `npx cachecatch audit "${report.projectName}" --window 24h`,
      successCriteria: [
        "cache-read rate improves materially",
        "first divergence moves after the stable prefix",
        "estimated recoverable cache loss drops",
      ],
    },
  }
}

function fieldsForFinding(finding?: CacheFinding): string[] {
  switch (finding?.type) {
    case "timestamp_in_prefix":
      return ["current_time", "timestamp"]
    case "request_id_in_prefix":
      return ["request_id", "session_id"]
    case "rag_before_stable_context":
      return ["retrieved_chunks", "doc_ids", "search_query"]
    case "tool_schema_drift":
      return ["available_tools", "tool_schema_hash", "environment_flags"]
    case "early_dynamic_metadata":
      return ["user_metadata", "customer_context", "request_metadata"]
    case "dynamic_system_prompt":
      return ["system_prompt_version", "template_version"]
    default:
      return ["dynamic request fields"]
  }
}

function causeForFinding(finding?: CacheFinding): string {
  switch (finding?.type) {
    case "timestamp_in_prefix":
      return "timestamp in prefix"
    case "request_id_in_prefix":
      return "request/session id in prefix"
    case "rag_before_stable_context":
      return "RAG chunks before stable rules"
    case "tool_schema_drift":
      return "changing tool schema prefix"
    case "early_dynamic_metadata":
      return "dynamic metadata before policy"
    case "dynamic_system_prompt":
      return "dynamic system prompt"
    default:
      return "early prefix divergence"
  }
}

function expectedRateForRoute(route: RouteAudit): string {
  const observed = route.observedCacheReadRate ?? 0
  const expected = Math.min(0.72, Math.max(0.35, observed + 0.35))
  return `${Math.round(expected * 100)}%`
}

function specificFixes(finding: CacheFinding | undefined, route: RouteAudit): string[] {
  switch (finding?.type) {
    case "timestamp_in_prefix":
      return [
        `Move current_time and timestamp fields below the stable prompt blocks in ${route.route}.`,
        "Keep system role, policies, tools, and static examples byte-identical across requests.",
      ]
    case "request_id_in_prefix":
      return [
        `Move request_id, session_id, and route-specific identifiers into the dynamic tail for ${route.route}.`,
        "Render stable policy and tool definitions before any per-request identifiers.",
      ]
    case "rag_before_stable_context":
      return [
        `Render ${route.route} summarization rules, output format, and examples before retrieved_chunks.`,
        "Append search results and user-specific documents after the stable instructions.",
      ]
    case "tool_schema_drift":
      return [
        "Freeze, sort, and version the stable tool schema block.",
        "Move runtime availability flags and environment-specific tool choices into a later dynamic block.",
      ]
    case "early_dynamic_metadata":
      return [
        `Split ${route.route} into stable_prefix and dynamic_tail.`,
        "Move customer, user, CRM, or memory fields after stable policy, tools, and examples.",
      ]
    default:
      return [finding?.recommendation ?? "Move volatile fields below the stable reusable prefix."]
  }
}

function agentInstructionFor(finding: CacheFinding | undefined, route: RouteAudit): string {
  const fields = fieldsForFinding(finding).join(", ")
  return `Refactor ${route.route} prompt assembly into stable_prefix and dynamic_tail. Render system role, policy, tool definitions, and static examples first. Put ${fields}, user context, retrieved context, and tool outputs in dynamic_tail.`
}

export function renderHeader(report: CachecatchReport): string {
  const rows = [
    `${C.brandBold(APP_NAME.toUpperCase())} ${C.muted(`v${APP_VERSION}`)}  ${C.muted("-")}  ${C.heading("Prompt Cache Audit")}`,
    C.dim("This report turns traced LLM runs into a prompt-cache repair plan: what breaks reuse, what it costs, and what to move."),
    "",
    `${C.muted(padRight("Target", 12))} ${C.value(report.projectName)}`,
    `${C.muted(padRight("Provider", 12))} ${C.text(sourceLabel(report))}`,
    `${C.muted(padRight("Window", 12))} ${C.text(WINDOW_LABELS[report.window] || report.window)}`,
    `${C.muted(padRight("Runs", 12))} ${C.text(`${formatNumber(report.summary.runsAnalyzed)} traces across ${formatNumber(report.summary.routesAnalyzed)} routes`)}`,
    `${C.muted(padRight("Status", 12))} ${C.good("✔ Audit complete")}  ${C.muted("Diagnosis")} ${displayConfidence(report.details?.diagnosisConfidence ?? report.confidence)}  ${C.muted("Money")} ${displayConfidence(report.details?.moneyConfidence ?? report.confidence)}`,
  ]

  const reason =
    report.details?.credibilityReason ??
    report.dataQuality.confidenceReasons.join(", ").toLowerCase()

  return [
    box("CACHECATCH", rows, "green"),
    dimNote(`Reason: ${reason}`),
    transition("Start with the financial picture, then inspect the prompt layout that causes it."),
  ].join("\n")
}

export function renderFounderSummary(report: CachecatchReport): string {
  const top = firstDiagnostic(report)
  const estimateLabel = report.details?.estimateLabel ?? "Estimated recoverable cache loss"
  const lowMoneyConfidence = (report.details?.moneyConfidence ?? report.confidence) === "low"
  const lines: string[] = [section("Founder Summary"), ""]
  lines.push(
    callout(
      "#",
      "We are checking whether repeated prompt blocks are landing in the provider cache or being billed like fresh input on every run.",
      C.evidence
    )
  )
  lines.push("")
  lines.push(
    box(
      `$ ${estimateLabel.toUpperCase()}`,
      [
        `${C.badBold(`${formatUsd(report.summary.estimatedMonthlyWasteUsd)} / month`)}  ${C.dim(`${moneyConfidenceLabel(report)} savings report`)}`,
        "",
        `${C.muted(padRight("Current cache-read rate", 27))} ${C.badBold(report.dataQuality.hasCacheReadTelemetry ? formatPercent(report.summary.observedCacheReadRate) : "unknown")}`,
        `${C.muted(padRight("Target after fixes", 27))} ${C.good(targetRate(report))}`,
        `${C.muted(padRight("Top leaking route", 27))} ${C.value(top?.route ?? "none")}`,
        `${C.muted(padRight("Fastest first fix", 27))} ${C.good(fastestFix(report))}`,
      ],
      "red"
    )
  )
  lines.push("")
  lines.push(callout("×", "Dynamic fields are entering the reusable prompt prefix before stable instructions, tools, policies, and examples.", C.bad))
  lines.push(callout("→", "That makes repeated context look unique to the model provider, so cache-read tokens stay low and prefill latency can stay higher.", C.evidence))
  lines.push("")
  lines.push(subsection("Founder Translation"))
  lines.push(subitem("Plain English", "You are not just using too many tokens.", 18))
  lines.push(subitem("What is leaking", lowMoneyConfidence ? "You may be paying full price for repeated context because prompt assembly is unstable." : "You are paying full price for repeated context because prompt assembly is unstable.", 18))
  lines.push("")
  lines.push(subsection("Technical Translation"))
  lines.push(subitem("Cache rule", "Prompt caching is prefix-sensitive.", 18))
  lines.push(subitem("Failure mode", "One volatile token near the top can make the downstream prompt unique.", 18))
  if (report.source === "sample") {
    lines.push("")
    lines.push(dimNote("Sample note: this is an enterprise workload example, not a universal guarantee. Real results depend on traffic, route mix, model mix, and telemetry."))
  } else if (lowMoneyConfidence) {
    lines.push("")
    lines.push(dimNote("Precision note: this is a prefix-drift estimate. Requires token/cache telemetry for precise savings."))
    if (telemetryDocsUrl(report)) {
      lines.push(dimNote(`Setup docs: ${telemetryDocsUrl(report)}`))
    }
  }
  lines.push("")
  lines.push(transition("Next, map the prompt order itself. The goal is to move stable tokens above the first changing value."))
  return lines.join("\n")
}

export function renderMoneyMath(report: CachecatchReport, explainMath = false): string {
  const details = report.details
  const label = details?.estimateLabel ?? "Estimated recoverable cache loss"
  const moneyConfidence = details?.moneyConfidence ?? report.confidence
  const lines: string[] = [section(moneyConfidence === "low" ? "Estimate Basis" : "Why This Number Is Credible"), ""]
  lines.push(
    callout(
      "#",
      moneyConfidence === "low"
        ? `${label}. This is useful for prioritization, but it needs token/cache telemetry before it should be treated as a precise savings number.`
        : "This estimate comes from missed reusable input tokens, the projected monthly run count, and the cached-read price delta shown below.",
      C.evidence
    )
  )
  lines.push("")
  const volumeRows = [
    `${C.muted(padRight("Runs analyzed", 34))} ${C.value(formatNumber(report.summary.runsAnalyzed))}`,
    `${C.muted(padRight("Projected monthly runs", 34))} ${C.value(formatNumber(details?.projectedMonthlyRuns ?? report.summary.runsAnalyzed * 4))}`,
  ]
  if (details?.projectionFormula) volumeRows.push(`${C.evidence("→")} ${C.dim(details.projectionFormula)}`)

  const tokenRows = [
    `${C.muted(padRight("Missed reusable tokens / run", 34))} ${C.value(formatNumber(details?.missedReusableTokensPerRun ?? report.summary.estimatedReusableTokensAfterDivergence))}`,
  ]
  if (details?.windowMissedReusableTokens !== undefined) {
    tokenRows.push(`${C.muted(padRight("Missed reusable tokens / window", 34))} ${C.value(formatNumber(details.windowMissedReusableTokens))}`)
    if (details.windowMissedReusableTokensFormula) tokenRows.push(`${C.evidence("→")} ${C.dim(details.windowMissedReusableTokensFormula)}`)
  }
  tokenRows.push(
    `${C.muted(padRight("Missed reusable tokens / month", 34))} ${C.value(formatNumber(details?.projectedMonthlyMissedReusableTokens ?? report.summary.estimatedCacheOpportunityTokens))}`
  )
  if (details?.monthlyMissedReusableTokensFormula && explainMath) {
    tokenRows.push(`${C.evidence("→")} ${C.dim(details.monthlyMissedReusableTokensFormula)}`)
  }

  const priceRows = [
    `${C.muted(padRight("Blended uncached input", 34))} ${C.value(details?.blendedUncachedInputCostPerMillion !== undefined ? `$${details.blendedUncachedInputCostPerMillion.toFixed(2)} / 1M tokens` : "unknown")}`,
    `${C.muted(padRight("Blended cached-read", 34))} ${C.value(details?.blendedCachedReadCostPerMillion !== undefined ? `$${details.blendedCachedReadCostPerMillion.toFixed(2)} / 1M tokens` : "unknown")}`,
    `${C.muted(padRight("Recoverable delta", 34))} ${C.good(details?.recoverableDeltaPerMillion !== undefined ? `$${details.recoverableDeltaPerMillion.toFixed(2)} / 1M tokens` : "unknown")}`,
  ]

  lines.push(box("Traffic Projection", volumeRows, "cyan"))
  lines.push("")
  lines.push(box("Missed Reusable Tokens", tokenRows, "cyan"))
  lines.push("")
  lines.push(box("Price Delta", priceRows, "green"))
  lines.push("")
  lines.push(
    box(
      "Monthly Recoverable Cache Loss",
      [
        C.evidence(details?.monthlyRecoverableCacheLossFormula ?? "Not calculated: token/cache telemetry is insufficient."),
        "",
        `${C.muted("Displayed estimate")}  ${C.badBold(`${formatUsd(report.summary.estimatedMonthlyWasteUsd)} / month`)}${
          details?.monthlyRecoverableCacheLossPrecise
            ? C.dim(`  (${formatUsdPrecise(details.monthlyRecoverableCacheLossPrecise)} before rounding)`)
            : ""
        }`,
      ],
      "red"
    )
  )
  lines.push("")
  lines.push(
    box(
      "Accuracy Note",
      [
        details?.savingsAccuracyNote ??
          "Savings accuracy depends on token usage, cache-read telemetry, pricing, and stable future traffic mix.",
        ...(moneyConfidence !== "high" && telemetryDocsUrl(report)
          ? [`Provider setup docs: ${telemetryDocsUrl(report)}`]
          : []),
      ],
      moneyConfidence === "high" ? "green" : moneyConfidence === "medium" ? "yellow" : "red"
    )
  )
  lines.push("")
  lines.push(dimNote("Assumption: future traffic volume, route mix, and model mix are similar to this audit window. Re-run after deploy to replace the estimate with fresh observed telemetry."))
  lines.push("")
  lines.push(transition("With the math exposed, the next section ranks where the money is leaking first."))
  return lines.join("\n")
}

export function renderCacheHealthScore(report: CachecatchReport): string {
  const lines: string[] = [section("Cache Health Score"), ""]
  lines.push(
    box(
      "Health",
      [
        `${C.muted("Score")}  ${C.value(`${report.score} / 100`)}   ${severity(report.score)}`,
        "",
        scoreBar(report.score),
      ],
      report.score < 30 ? "red" : report.score < 55 ? "yellow" : "green",
      54
    )
  )
  lines.push("")
  lines.push("  Why the score is low:")
  const rate = report.summary.observedCacheReadRate
  if (rate === null) lines.push(`  ${C.warn("!")} cache-read rate is unknown because cached-token telemetry is missing`)
  else if (rate < 0.2) lines.push(`  ${C.bad("×")} cache-read rate is far below expected range`)
  lines.push(`  ${C.bad("×")} top routes diverge before stable policy/tool/example blocks`)
  lines.push(`  ${C.bad("×")} dynamic metadata appears inside the reusable prefix`)
  lines.push(`  ${C.bad("×")} high-context routes have large repeated stable sections after divergence`)
  lines.push("")
  lines.push("  What good looks like:")
  lines.push(`  ${C.good("✔")} stable system instructions first`)
  lines.push(`  ${C.good("✔")} stable tool schemas before dynamic request data`)
  lines.push(`  ${C.good("✔")} stable examples before user/session fields`)
  lines.push(`  ${C.good("✔")} timestamps, IDs, RAG chunks, and tool outputs pushed to dynamic tail`)
  return lines.join("\n")
}

export function renderTopLeaksTable(report: CachecatchReport, limit?: number, full = false): string {
  const diagnostics = routeDiagnostics(report)
    .slice()
    .sort((a, b) => b.monthlyRecoverableLossUsd - a.monthlyRecoverableLossUsd)
    .filter((route) => full || route.monthlyRecoverableLossUsd > 0)
    .slice(0, limit ?? routeDiagnostics(report).length)

  const lines: string[] = [section("Top Cache Leaks By Money"), ""]
  const widths = {
    i: 3,
    route: 26,
    loss: 10,
    rate: 8,
    div: 12,
    cause: 30,
  }
  const tableRows: string[] = []
  tableRows.push(
    `${C.heading(padRight("#", widths.i))} ${C.heading(padRight("Route", widths.route))} ${C.heading(padRight("Loss/mo", widths.loss))} ${C.heading(padRight("Cache", widths.rate))} ${C.heading(padRight("Divergence", widths.div))} ${C.heading("Cause")}`
  )
  tableRows.push(C.muted("─".repeat(96)))
  if (diagnostics.length === 0) {
    tableRows.push(C.dim("No nonzero route-level recoverable loss estimates in default view. Re-run with --full to inspect zero-value diagnostics."))
  }
  diagnostics.forEach((route, index) => {
    tableRows.push(
      `${padRight(String(index + 1), widths.i)} ${padRight(C.value(routeTableLabel(route.route, widths.route)), widths.route)} ${padRight(C.badBold(formatUsd(route.monthlyRecoverableLossUsd)), widths.loss)} ${padRight(report.dataQuality.hasCacheReadTelemetry ? formatPercent(route.observedCacheReadRate) : "unknown", widths.rate)} ${padRight(`t${formatNumber(route.firstDivergenceToken)}`, widths.div)} ${truncate(route.cause, widths.cause)}`
    )
  })
  lines.push(box("Ranked by monthly recoverable loss", tableRows, "red"))
  const firstTwo = diagnostics.slice(0, 2).reduce((sum, r) => sum + r.monthlyRecoverableLossUsd, 0)
  if (diagnostics.length >= 2) {
    lines.push("")
    lines.push(
      wrappedLine(
        "  ",
        `Founder translation: Fix route #1 and #2 first. They account for ${C.badBold(`${formatUsd(firstTwo)}/month`)} of recoverable cache loss.`,
        "  "
      )
    )
  }
  return lines.join("\n")
}

export function renderRouteDiagnostic(
  route: CachecatchRouteDiagnostic,
  totalLoss: number,
  hasCacheTelemetry = true
): string {
  const share = totalLoss > 0 ? route.monthlyRecoverableLossUsd / totalLoss : 0
  const lines: string[] = [routeSection(`ROUTE DIAGNOSTIC: ${route.route}`), ""]
  lines.push(
    box(
      `${route.model ?? "model unknown"}  |  ${formatUsd(route.monthlyRecoverableLossUsd)}/mo`,
      [
        `${C.bad("×")} ${route.mainIssue}`,
        "",
        `${C.muted(padRight("Share of total loss", 27))} ${C.value(formatPercent(share))}`,
        `${C.muted(padRight("Avg input", 27))} ${C.value(formatTokensShort(route.avgInputTokens))}`,
        `${C.muted(padRight("Cache-read now", 27))} ${C.badBold(hasCacheTelemetry ? formatPercent(route.observedCacheReadRate) : "unknown")}`,
        `${C.muted(padRight("Expected after fix", 27))} ${C.good(`~${route.expectedCacheReadRate}`)}`,
        `${C.muted(padRight("First divergence", 27))} ${C.warn(`token ${formatNumber(route.firstDivergenceToken)}`)}`,
      ],
      route.monthlyRecoverableLossUsd > 2000 ? "red" : "yellow"
    )
  )
  lines.push("")
  lines.push(subsection("Detected Dynamic Fields"))
  lines.push(`  ${C.muted("│")} ${route.detectedFields.map((field) => C.warn(field)).join(C.muted(", "))}`)
  lines.push("")

  const evidenceRows = [
    `${C.evidence("#")} Trace ${route.evidence.traceId}`,
    `First divergence at token ${formatNumber(route.firstDivergenceToken)}:`,
    `  "${route.evidence.changingValue}"`,
  ]
  if (route.evidence.comparisonTraceId && route.evidence.comparisonValue) {
    evidenceRows.push("")
    evidenceRows.push(`${C.evidence("#")} Trace ${route.evidence.comparisonTraceId}`)
    evidenceRows.push("Same position changed to:")
    evidenceRows.push(`  "${route.evidence.comparisonValue}"`)
  }
  evidenceRows.push("")
  evidenceRows.push(`Pattern detected in ${route.evidence.patternRate}.`)
  lines.push(box("Evidence", evidenceRows, "cyan"))
  lines.push("")
  lines.push(subsection("Likely Prompt Builder"))
  lines.push(`  ${C.muted("│")} ${route.sourceLocation ?? "Source file unavailable from traces. Apply this pattern in the prompt builder for this route."}`)
  lines.push("")
  lines.push(subsection("Why It Hurts"))
  lines.push(subitem("Human", route.whyItHurts.human, 10))
  lines.push(subitem("Technical", route.whyItHurts.technical, 10))
  lines.push("")
  lines.push(
    box(
      "What To Change",
      route.whatToChange.map((change) => `${C.good("→")} ${change}`),
      "green"
    )
  )
  lines.push("")
  lines.push(subsection("Validation After Deploy"))
  lines.push(subitem("Re-run", route.validation.command, 10))
  route.validation.successCriteria.forEach((criterion) => lines.push(`  ${C.muted("│")} ${C.good("✔")} ${criterion}`))
  return lines.join("\n")
}

export function renderOptimizedPromptStructure(report: CachecatchReport): string {
  const top = firstDiagnostic(report)
  const lines: string[] = [section("Before / Fix / After Prompt Map"), ""]
  lines.push(
    callout(
      "#",
      "This is the fastest way to read the report: the left side shows why cache breaks today, the middle shows the move, and the right side shows the cache-friendly order to ship.",
      C.evidence
    )
  )
  lines.push("")
  const beforeRows = [
    `${C.badBold("Recoverable loss")}  ${C.badBold(`${formatUsd(report.summary.estimatedMonthlyWasteUsd)}/mo`)}  ${C.dim(moneyConfidenceLabel(report))}`,
    `${C.muted("First divergence")}  ${top ? C.warn(`token ${formatNumber(top.firstDivergenceToken)}`) : C.warn("unknown")}`,
    `${C.muted("Cache health")}      ${C.value(`${report.score} / 100`)}  ${severity(report.score)}`,
    "",
    `${C.bad("×")}  [timestamp / request_id / session_id]`,
    `${C.bad("×")}  [order_id / customer_id / CRM data]`,
    `${C.bad("×")}  [RAG chunks / search results]`,
    C.muted(""),
    `${C.dim("should be cached")}  [system prompt]`,
    `${C.dim("should be cached")}  [tool definitions]`,
    `${C.dim("should be cached")}  [policy and rules]`,
    `${C.dim("should be cached")}  [few-shot examples]`,
    `${C.evidence("dynamic")}           [user message]`,
  ]
  const fixRows = [
    `${C.evidence("First divergence")} ${top ? `token ${formatNumber(top.firstDivergenceToken)}` : "unknown"}`,
    `${C.evidence("Cause")}            ${truncate(top?.cause ?? report.summary.topBreaker, 38)}`,
    `${C.good("Fix")}              ${truncate(fastestFix(report), 42)}`,
    "",
    `${C.good("move up")}     stable system prompt`,
    `${C.good("move up")}     tool definitions`,
    `${C.good("move up")}     policies and examples`,
    C.muted("────────────────────────────────────────────"),
    `${C.bad("move down")}   timestamps, IDs, metadata`,
    `${C.bad("move down")}   RAG chunks and tool outputs`,
    `${C.bad("move down")}   user-specific context`,
  ]
  const afterRows = [
    ...report.recommendedLayout.stablePrefix.map(
      (line) => `${C.good("✔")}  ${padRight(line, 34)} ${C.good("stable")}`
    ),
    C.muted("─".repeat(44)),
    ...report.recommendedLayout.dynamicTail.map(
      (line) => `${C.evidence("→")}  ${padRight(line, 34)} ${C.evidence("dynamic")}`
    ),
    "",
    `${C.good("Savings target")} ${C.good(`${formatUsd(report.summary.estimatedMonthlyWasteUsd)}/mo recoverable`)}`,
    `${C.good("Speed impact")}   ${C.good("lower prefill work when cache reads recover")}`,
  ]
  const narrow = WIDTH < 112
  const wideEnoughForThree = WIDTH >= 118
  const panelWidth = narrow ? Math.min(WIDTH, 96) : wideEnoughForThree ? 38 : Math.floor((Math.min(WIDTH, 112) - 2) / 2)
  const before = box("1 BEFORE - prefix breaks early", beforeRows, "red", panelWidth)
  const fix = box("2 CACHECATCH FIX", fixRows, "cyan", panelWidth)
  const after = box("3 AFTER - stable prefix first", afterRows.filter(Boolean), "green", panelWidth)
  if (wideEnoughForThree) {
    lines.push(sideBySide(sideBySide(before, fix), after))
  } else {
    lines.push(narrow ? `${before}\n\n${fix}\n\n${after}` : `${sideBySide(before, after)}\n\n${fix}`)
  }
  lines.push("")
  lines.push(callout("→", "Plain English: put reusable instructions first. Put request-specific facts later.", C.good))
  lines.push("")
  lines.push(callout("#", "Technical translation: cache is prefix-sensitive. One volatile token near the top can make the downstream prompt unique.", C.evidence))
  lines.push("")
  lines.push(transition("Now that the prompt move is visible, the report proves the money estimate and ranks the routes to fix first."))
  return lines.join("\n")
}

export function renderPersonalizedFixPlan(report: CachecatchReport): string {
  const nonZero = routeDiagnostics(report).filter((route) => route.monthlyRecoverableLossUsd > 0)
  const diagnostics = (nonZero.length > 0 ? nonZero : routeDiagnostics(report)).slice(0, 3)
  const lines: string[] = [section("Personalized Fix Plan"), ""]
  diagnostics.forEach((route, index) => {
    lines.push(
      box(
        `Priority ${index + 1}  |  ${route.route}`,
        [
          `${C.muted(padRight("Reason", 14))} ${index === 0 ? `Largest recoverable loss source: ${C.badBold(`${formatUsd(route.monthlyRecoverableLossUsd)}/month`)}.` : route.mainIssue}`,
          `${C.muted(padRight("Change", 14))} ${route.whatToChange[0]}`,
          `${C.muted(padRight("Validate", 14))} ${C.good(route.validation.successCriteria[0])}`,
        ],
        index === 0 ? "red" : "yellow"
      )
    )
    if (index < diagnostics.length - 1) lines.push("")
  })
  return lines.join("\n")
}

export function renderAgentRepairPrompt(report: CachecatchReport): string {
  const diagnostics = routeDiagnostics(report)
    .filter((route) => route.monthlyRecoverableLossUsd > 0)
    .slice(0, 3)
  const selected = diagnostics.length > 0 ? diagnostics : routeDiagnostics(report).slice(0, 3)
  const routeLines = selected.map(
    (route, index) =>
      `${index + 1}. ${route.route}: move ${route.detectedFields.join(", ")} below the stable prefix; first divergence is token ${formatNumber(route.firstDivergenceToken)}; recoverable loss is ${formatUsd(route.monthlyRecoverableLossUsd)}/mo.`
  )
  const prompt = [
    "You are fixing prompt-cache losses in this codebase.",
    `Goal: reduce ${formatUsd(report.summary.estimatedMonthlyWasteUsd)}/mo in ${moneyConfidenceLabel(report).replace(/\u001b\[[0-9;]*m/g, "")} recoverable cache loss without changing agent behavior.`,
    "Refactor prompt assembly into stable_prefix and dynamic_tail.",
    "stable_prefix must render first and stay byte-stable across comparable requests: system role, policies, tool definitions, output rules, and static examples.",
    "dynamic_tail must render after that: timestamps, request/session/user IDs, CRM/order metadata, RAG chunks, memory summaries, user messages, tool outputs, and runtime availability flags.",
    "Route-specific priorities:",
    ...routeLines,
    "Validation: rerun Cachecatch after deploy; first divergence should move after the stable prefix, cache-read telemetry should improve, and recoverable loss should fall.",
  ]
  return [
    section("Agent Repair Prompt"),
    "",
    callout("#", "Use this as the implementation brief for Codex, Claude Code, OpenCode, or your internal agent.", C.evidence),
    "",
    box("Prompt", prompt, "green"),
  ].join("\n")
}

export function renderFullAgentPrompt(report: CachecatchReport): string {
  const diagnostics = routeDiagnostics(report)
  const routeLines = diagnostics.flatMap((route, index) => [
    `${index + 1}. ${route.route} (${route.model ?? "unknown model"})`,
    `   Impact: ${formatUsd(route.monthlyRecoverableLossUsd)}/month recoverable cache loss; cache-read ${formatPercent(route.observedCacheReadRate)}; first divergence token ${formatNumber(route.firstDivergenceToken)}.`,
    `   Problem: ${route.mainIssue}`,
    `   Move out of stable prefix: ${route.detectedFields.join(", ")}.`,
    `   Change: ${route.whatToChange.join(" ")}`,
    route.sourceLocation
      ? `   Likely builder: ${route.sourceLocation}.`
      : "   Source file unavailable from traces; find the prompt builder for this route.",
    "",
  ])

  const prompt = [
    "You are fixing prompt-cache losses in this codebase.",
    "",
    "Goal:",
    `Reduce estimated recoverable cache loss from ${formatUsd(report.summary.estimatedMonthlyWasteUsd)}/month by making prompt assembly cache-friendly without changing agent behavior.`,
    "",
    "Core rule:",
    "Prompt caching is prefix-sensitive. Stable instructions must render before any request-specific value. Do not put timestamps, request IDs, session IDs, user IDs, order IDs, retrieved chunks, CRM notes, memory summaries, tool outputs, or runtime environment flags inside the stable prefix.",
    "",
    "Required prompt structure:",
    "stable_prefix:",
    "  - system role and constraints",
    "  - stable policy/rules",
    "  - stable tool definitions or versioned schema block",
    "  - static examples",
    "",
    "dynamic_tail:",
    "  - request metadata",
    "  - user/customer/order/CRM context",
    "  - retrieved chunks/search results",
    "  - memory summaries",
    "  - user message",
    "  - tool outputs",
    "",
    "Route-specific fixes:",
    ...routeLines,
    "Implementation requirements:",
    "- Preserve existing agent behavior, policies, examples, and output formats.",
    "- Keep stable text byte-stable across comparable requests.",
    "- Sort and version stable tool schemas where tool schema drift exists.",
    "- Do not add auth, database, billing, storage, or observability features.",
    "- Keep analysis/provider logic out of UI components.",
    "",
    "Validation:",
    `- Re-run: ${report.source === "sample" ? 'npx cachecatch audit "acme-support-agent" --window 24h' : `npx cachecatch audit "${report.projectName}" --provider ${report.source} --window 24h`}`,
    "- Success: cache-read rate improves materially, first divergence moves after stable prefix, and estimated recoverable cache loss drops by at least 50%.",
  ]

  return [
    section("Full Agent Repair Prompt"),
    "",
    C.dim("  Copy this whole prompt into Codex, Claude Code, or OpenCode to implement the fixes."),
    "",
    box("Prompt", prompt, "green"),
  ].join("\n")
}

export function renderValidationPlan(report: CachecatchReport): string {
  const command =
    report.source === "sample"
      ? 'npx cachecatch audit "acme-support-agent" --window 24h'
      : `npx cachecatch audit "${report.projectName}" --provider ${report.source} --window 24h`
  const nonZero = routeDiagnostics(report).filter((route) => route.monthlyRecoverableLossUsd > 0)
  const selected = (nonZero.length > 0 ? nonZero : routeDiagnostics(report)).slice(0, 3)
  const criteria = selected.flatMap((route, index) => {
    const n = index + 1
    return [
      `${n}. ${route.route}: first divergence moves later than token ${formatNumber(route.firstDivergenceToken)}.`,
      `${n}. ${route.route}: estimated recoverable cache loss drops below ${formatUsd(route.monthlyRecoverableLossUsd)}/month.`,
      `${n}. ${route.route}: ${report.dataQuality.hasCacheReadTelemetry ? "cache-read telemetry improves in the next validation window" : "cache-read telemetry is enabled or remains explicitly unknown"}.`,
      `${n}. ${route.route}: prompt prefix becomes more stable across comparable traces.`,
    ]
  })
  return [
    section("Validation Plan"),
    "",
    box("Re-run After Deploy", [command], "cyan"),
    "",
    box("Success Criteria", criteria.map((line) => `${C.good("✔")} ${line}`), "green"),
    "",
    callout("!", "If this does not happen, run with --compare-prompts and inspect the first divergence examples.", C.warn),
  ].join("\n")
}

export function renderDataQuality(report: CachecatchReport): string {
  const dq = report.dataQuality
  const items: Array<[string, boolean]> = [
    ["Rendered prompts available", dq.hasRenderedPrompts],
    ["Token usage available", dq.hasTokenUsage],
    ["Cache-read telemetry available", dq.hasCacheReadTelemetry],
    ["Cache-creation telemetry available", dq.hasCacheCreationTelemetry],
    ["Provider metadata available", dq.hasProviderMetadata],
    ["Model metadata available", dq.hasModelMetadata],
    [`Comparable route groups: ${dq.comparableRunGroups}`, dq.comparableRunGroups > 0],
    ["Pricing config loaded", true],
    ["Monthly projection shown", true],
  ]
  const lines: string[] = [section("Data Quality"), ""]
  lines.push(
    box(
      "Confidence",
      [
        `${C.muted(padRight("Diagnosis confidence", 24))} ${displayConfidence(report.details?.diagnosisConfidence ?? report.confidence)}`,
        `${C.muted(padRight("Money confidence", 24))} ${displayConfidence(report.details?.moneyConfidence ?? report.confidence)}`,
        `${C.muted(padRight("Telemetry quality", 24))} ${C.value((report.details?.telemetryQuality ?? "partial").toUpperCase())}`,
        `${C.muted(padRight("Reason", 24))} ${report.details?.confidenceReason ?? report.dataQuality.confidenceReasons.join(", ")}`,
      ],
      (report.details?.moneyConfidence ?? report.confidence) === "high" ? "green" : (report.details?.moneyConfidence ?? report.confidence) === "medium" ? "yellow" : "red",
      82
    )
  )
  lines.push("")
  lines.push(
    box(
      "Telemetry Inputs",
      items.map(([label, ok]) => `${ok ? C.good("✔") : C.warn("!")} ${label}`),
      report.confidence === "high" ? "green" : report.confidence === "medium" ? "yellow" : "red",
      62
    )
  )
  lines.push("")
  lines.push(callout("#", "CacheCatch can compare rendered prompt prefixes across repeated route groups and validate findings against provider cache-read telemetry.", C.evidence))
  if (dq.warnings.length > 0) {
    lines.push("")
    lines.push("  Warnings:")
    dq.warnings.slice(0, 4).forEach((warning) => lines.push(`    ${C.warn("!")} ${warning}`))
  }
  return lines.join("\n")
}

export function renderExportCommands(report: CachecatchReport): string {
  const provider = report.source === "sample" ? "langsmith" : report.source
  const jsonCommand =
    report.source === "sample"
      ? "npx cachecatch sample --json > ./cachecatch-report.json"
      : `npx cachecatch audit "${report.projectName}" --provider ${provider} --window ${report.window} --json > ./cachecatch-report.json`
  const writeCommand =
    report.source === "sample"
      ? "npx cachecatch sample --format json --out ./cachecatch-report.json"
      : `npx cachecatch audit "${report.projectName}" --provider ${provider} --window ${report.window} --format json --out ./cachecatch-report.json`
  return [
    section(report.source === "sample" ? "Export / Run Real Audit Commands" : "Export Commands"),
    "",
    box(
      "Commands",
      [
        `${C.muted("Save JSON")}            ${jsonCommand}`,
        `${C.muted("Export HTML")}          npx cachecatch export ./cachecatch-report.json --format html --out ./cachecatch-report.html`,
        `${C.muted("Write JSON directly")}  ${writeCommand}`,
        `${C.muted("Run real audit")}       npx cachecatch audit "your-agent-app" --provider ${provider} --window 7d`,
      ],
      "cyan"
    ),
  ].join("\n")
}

export function renderRouteDiagnostics(report: CachecatchReport, full = false): string {
  const diagnostics = routeDiagnostics(report)
  const nonZero = diagnostics.filter((route) => route.monthlyRecoverableLossUsd > 0)
  const selected = (full ? diagnostics : nonZero.length > 0 ? nonZero : diagnostics).slice(0, full ? diagnostics.length : 3)
  return selected
    .map((route) => renderRouteDiagnostic(route, report.summary.estimatedMonthlyWasteUsd, report.dataQuality.hasCacheReadTelemetry))
    .join(`\n\n${divider()}\n\n`)
}

export function renderTerminalReport(
  report: CachecatchReport,
  options: TerminalReportOptions = {}
): string {
  return renderTerminalReportSections(report, options).join(`\n\n${divider()}\n\n`)
}

export function renderTerminalReportSections(
  report: CachecatchReport,
  options: TerminalReportOptions = {}
): string[] {
  return [
    renderHeader(report),
    renderFounderSummary(report),
    renderOptimizedPromptStructure(report),
    renderMoneyMath(report, Boolean(options.explainMath)),
    renderCacheHealthScore(report),
    renderTopLeaksTable(report, undefined, Boolean(options.full)),
    renderRouteDiagnostics(report, Boolean(options.full)),
    renderPersonalizedFixPlan(report),
    renderAgentRepairPrompt(report),
    ...(options.full || options.showAgentPrompt ? [renderFullAgentPrompt(report)] : []),
    renderValidationPlan(report),
    renderDataQuality(report),
    renderExportCommands(report),
    renderShareCta(report),
  ]
}

export function renderShareCta(report: CachecatchReport): string {
  const jsonPath = report.source === "sample"
    ? "./cachecatch-report.json"
    : `./cachecatch-report.json`
  return [
    "",
    `${C.bad("\u2764\uFE0F")}  ${C.heading("Support the project by sharing your report on X")}`,
    `    ${C.brand("npx cachecatch share")} ${C.muted(jsonPath)}`,
    "",
  ].join("\n")
}

export function renderCompactSummary(report: CachecatchReport): string {
  const top = routeDiagnostics(report).slice(0, 3)
  const lines: string[] = []
  lines.push(
    box(
      "CACHECATCH",
      [
        `${C.brandBold(`${APP_NAME.toUpperCase()} v${APP_VERSION}`)} ${C.muted("- Prompt Cache Audit")}`,
        C.value(report.projectName),
        "",
        `${C.badBold("EST. RECOVERABLE CACHE LOSS")}  ${C.badBold(`${formatUsd(report.summary.estimatedMonthlyWasteUsd)} / month`)}`,
        `${C.muted("Current cache-read")} ${C.value(report.dataQuality.hasCacheReadTelemetry ? formatPercent(report.summary.observedCacheReadRate) : "unknown")}  ${C.muted("→ target")} ${C.good(targetRate(report))}`,
      ],
      "red",
      82
    )
  )
  lines.push("")
  const leakRows = ["Top leaks:"]
  top.forEach((route, index) => {
    leakRows.push(
      `${index + 1}. ${padRight(route.route, 26)} ${C.badBold(padLeft(formatUsd(route.monthlyRecoverableLossUsd), 8))}  ${C.muted(route.cause)}`
    )
  })
  lines.push(box("Fastest Payback", leakRows, "yellow", 82))
  lines.push("")
  lines.push(`  ${C.good("→")} Fix summary: ${fastestFix(report)}.`)
  lines.push("")
  lines.push("  Export this sample:")
  lines.push("    npx cachecatch sample --full --out ./cachecatch-report.html")
  lines.push("")
  lines.push("  Run on real traces:")
  lines.push('    npx cachecatch audit "your-agent-app" --provider langsmith --window 7d')
  lines.push("")
  lines.push(`  ${C.bad("\u2764\uFE0F")}  Share your report on X: npx cachecatch share ./cachecatch-report.json`)
  return lines.join("\n")
}

export function renderFindingsList(report: CachecatchReport): string {
  const lines: string[] = [section("Findings"), ""]
  for (const finding of report.findings) {
    lines.push(
      `  ${C.warn(SEV_LABEL[finding.severity])}  ${C.value(finding.title)}  ${C.muted(finding.route)}`
    )
    lines.push(`      ${C.evidence("#")} ${truncate(finding.evidence, 110)}`)
  }
  return lines.join("\n")
}

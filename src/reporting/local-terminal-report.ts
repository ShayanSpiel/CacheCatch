import chalk from "chalk"
import boxen from "boxen"
import type { LocalAgentReport } from "../types/index.ts"

export interface LocalTerminalReportOptions {
  debug?: boolean
}

function fmtInt(value: number): string {
  return Math.round(value).toLocaleString("en-US")
}

function fmtUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "unavailable"
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "not reported"
  return `${Math.round(value * 100)}%`
}

function fmtCompact(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2).replace(/\.00$/, "")}B`
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2).replace(/\.00$/, "")}M`
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`
  return fmtInt(value)
}

function metric(label: string, value: string, note?: string, width = 26): string {
  return `${chalk.gray(label.padEnd(width))} ${chalk.whiteBright.bold(value)}${note ? chalk.gray(`  ${note}`) : ""}`
}

function detail(label: string, text: string, color: "cyan" | "green" | "yellow" | "gray" = "gray"): string {
  const paint = color === "cyan" ? chalk.cyanBright : color === "green" ? chalk.greenBright : color === "yellow" ? chalk.yellowBright : chalk.gray
  return `${paint(label.padEnd(10))} ${chalk.gray(text)}`
}

function fmtUsdRange(range: LocalAgentReport["summary"]["recoverableCashSaving"]): string {
  if (!range || range.low === undefined || range.high === undefined) return "unavailable"
  return `${fmtUsd(range.low)}-${fmtUsd(range.high)}`
}

function miniBox(title: string, rows: string[], color: "cyan" | "green" | "yellow" | "red" | "gray" = "gray"): string {
  return boxen(rows.join("\n"), {
    title,
    titleAlignment: "left",
    borderStyle: "round",
    borderColor: color,
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    width: Math.max(72, Math.min(104, process.stdout.columns || 100)),
  })
}

function brandColor(provider: string): "cyan" | "green" | "yellow" | "red" | "gray" {
  if (provider === "claude-code") return "yellow"
  if (provider === "codex") return "green"
  if (provider === "opencode") return "cyan"
  return "gray"
}

function scoreBar(score: number | null): string {
  if (score === null) return chalk.gray("not available")
  const width = 24
  const filled = Math.round((Math.max(0, Math.min(100, score)) / 100) * width)
  const color = score >= 70 ? chalk.greenBright : score >= 40 ? chalk.yellowBright : chalk.redBright
  return color("█".repeat(filled)) + chalk.gray("░".repeat(width - filled))
}

function healthLabel(score: number | null): string {
  if (score === null) return chalk.gray("UNAVAILABLE")
  if (score >= 70) return chalk.greenBright.bold("HEALTHY")
  if (score >= 40) return chalk.yellowBright.bold("WATCH")
  return chalk.redBright.bold("CRITICAL")
}

function cacheReadLabel(value: number | null): string {
  if (value === null) return chalk.gray("NOT REPORTED")
  if (value >= 0.8) return chalk.greenBright.bold("ELITE")
  if (value >= 0.5) return chalk.greenBright.bold("STRONG")
  if (value >= 0.35) return chalk.yellowBright.bold("DEVELOPING")
  return chalk.redBright.bold("LOW")
}

function tokenNote(kind: string, provider?: string): string {
  if (kind === "observed") {
    if (provider === "claude-code") return "observed from Claude local token events"
    if (provider === "codex") return "observed from Codex local JSONL token events"
    if (provider === "opencode") return "observed from OpenCode local database"
    return "observed from local agent telemetry"
  }
  if (kind === "mixed") {
    if (provider === "claude-code") return "mixed: Claude token events + transcript estimate"
    if (provider === "codex") return "mixed: Codex token events + transcript estimate"
    if (provider === "opencode") return "observed from OpenCode local database"
    return "mixed observed/estimated"
  }
  if (kind === "estimated") return "estimated from transcript text length"
  return "unavailable"
}

function agentName(provider: string): string {
  if (provider === "claude-code") return "Claude Code"
  if (provider === "codex") return "Codex"
  if (provider === "opencode") return "OpenCode"
  return provider
}

function topModels(models: string[]): string {
  const visible = models.filter((model) => model !== "unknown" && model !== "<synthetic>")
  if (visible.length === 0) return "not reported"
  return visible.slice(0, 3).join(", ") + (visible.length > 3 ? ` +${visible.length - 3}` : "")
}

function topSubagents(items: Array<{ name: string; sessions: number }>): string {
  if (items.length === 0) return "none detected"
  return items.slice(0, 4).map((item) => `${item.name} (${item.sessions})`).join(", ")
}

function fixPrompt(): string {
  return [
    "You are working in this repository. Keep all stable project instructions at the top of context and keep them byte-stable across sessions.",
    "Use AGENTS.md or CLAUDE.md for repository rules, commands, architecture constraints, and test expectations.",
    "Put dynamic material only after the stable context: terminal output, logs, stack traces, git diffs, timestamps, current branch state, and one-off task notes.",
    "When continuing old work, summarize the previous session first instead of replaying full transcripts.",
    "Target: preserve high observed cache-read where telemetry exists, and improve transcript-only agents by keeping stable context first and volatile context last.",
  ].join("\n")
}

function cacheScope(report: LocalAgentReport): string {
  if (report.summary.cacheReadPercent === null) return "no local cache-token telemetry found"
  if (report.summary.tokenAccounting === "mixed") return `observed on ${observedCacheAgents(report)} only; transcript-only agents are excluded`
  return "observed from local cache-token telemetry"
}

function observedCacheAgents(report: LocalAgentReport): string {
  const agents = report.agents
    .filter((agent) => agent.sessionsAnalyzed > 0 && agent.cacheReadPercent !== null)
    .map((agent) => agentName(agent.provider))
  return agents.length > 0 ? agents.join(", ") : "agents that expose cache tokens"
}

function telemetryCoverage(report: LocalAgentReport): string {
  const coverage = report.summary.coverage?.cacheTokenTelemetry
  if (!coverage || coverage === "unavailable") return "unavailable"
  if (coverage === "full") return `observed across ${observedCacheAgents(report)}`
  return `partial; observed on ${observedCacheAgents(report)}`
}

function agentVisibility(agent: LocalAgentReport["agents"][number]): string {
  if (agent.sessionsAnalyzed === 0) return "not detected"
  if (agent.visibility === "exact_cache_telemetry") return "telemetry-rich"
  if (agent.visibility === "token_telemetry_only") return "token telemetry only"
  if (agent.visibility === "transcript_context_only") return "transcript-rich / cache-telemetry limited"
  return "visibility limited"
}

function sourceLabel(agent: LocalAgentReport["agents"][number]): string {
  if (agent.telemetrySources.length === 0) return "not reported"
  return agent.telemetrySources.map((source) => {
    if (source === "local_db") return "local database"
    if (source === "local_jsonl") return "local JSONL token events"
    if (source === "otel_logs") return "OTel logs"
    if (source === "otel_metrics") return "OTel metrics"
    return "transcript"
  }).join(", ")
}

function setupHint(agent: LocalAgentReport["agents"][number]): string | null {
  if (agent.sessionsAnalyzed === 0 || agent.cacheFieldPresent) return null
  if (agent.provider === "codex") return "Run `npx cachecatch init codex` to enable future Codex OTel telemetry."
  if (agent.provider === "claude-code") return "Run `npx cachecatch init claude`, then start Claude Code with the generated env file to enable future cache/token telemetry."
  return null
}

function tokenFieldsUnclear(agent: LocalAgentReport["agents"][number]): boolean {
  return agent.cacheFieldPresent === true && agent.cacheReadPercent === null && agent.totalTokens === 0
}

function cacheTelemetryLabel(agent: LocalAgentReport["agents"][number]): { value: string; note: string } {
  if (!agent.cacheFieldPresent) return { value: "not reported", note: "no explicit cache fields observed" }
  if (agent.cacheReadPercent === null) return { value: "fields observed", note: "cache denominator semantics unclear" }
  return { value: "observed", note: "explicit local token fields present" }
}

function cacheReadValue(agent: LocalAgentReport["agents"][number]): { value: string; note: string } {
  if (!agent.cacheFieldPresent) return { value: "not reported", note: "missing cache field" }
  if (agent.cacheReadPercent === null) return { value: "not reported", note: "semantics unclear" }
  return { value: fmtPct(agent.cacheReadPercent), note: "observed" }
}

function agentHygieneValue(agent: LocalAgentReport["agents"][number]): { value: string; note: string } {
  if (agent.sessionsAnalyzed === 0) return { value: "unavailable", note: "no parsed sessions" }
  return { value: `${agent.cacheLeakScore} / 100`, note: healthLabel(agent.cacheLeakScore).replace(/\u001b\[[0-9;]*m/g, "") }
}

function findingWhy(id: string): string {
  if (id === "local-cache-telemetry-not-reported") {
    return "This is a measurement limitation, not proof of bad Codex/Claude behavior. The honest output is 'not reported' until local files expose cache-read/cache-write tokens."
  }
  if (id === "dynamic-context-early") {
    return "Prompt caching is prefix-sensitive. If diffs, logs, timestamps, and tool output appear before stable repo rules, the reusable prefix changes sooner."
  }
  if (id === "repeated-project-context") {
    return "Repeating repo instructions inside ad hoc prompts wastes context and makes every agent rebuild the same prefix instead of reusing one stable project file."
  }
  if (id === "long-sessions-no-summary") {
    return "Long replayed sessions push old dynamic state into future prompts. Summaries preserve intent while keeping the next prompt smaller and more reusable."
  }
  if (id === "unknown-model-pricing") {
    return "Token and cache percentages can still be accurate, but dollar equivalents are partial when a detected local model string does not match Cachecatch's built-in pricing registry."
  }
  if (id === "weak-agents-md" || id === "weak-claude-md") {
    return "Agent instruction files are the best place for stable context: repo layout, commands, constraints, style, and testing expectations."
  }
  return "This changes how much stable context can be reused across local agent sessions."
}

function repairPromptFromFindings(findings: LocalAgentReport["findings"]): string {
  const strong = findings.filter((f) => f.severity === "high" || f.severity === "medium").slice(0, 2)
  if (strong.length === 0) return fixPrompt()
  const lines = [
    "You are improving local agent prompt-cache hygiene.",
    "",
  ]
  strong.forEach((finding, i) => {
    const evidence = finding.evidence.replace(/\.\./g, ".").replace(/\s+/g, " ").trim()
    const recommendation = finding.recommendation.replace(/\.\./g, ".").replace(/\s+/g, " ").trim()
    lines.push(`${i + 1}. ${finding.title}.`)
    lines.push(`Evidence: ${evidence}`)
    lines.push(`Fix: ${recommendation}`)
    lines.push("")
  })
  lines.push("Validate by rerunning CacheCatch for the same window and checking whether the same findings remain.")
  return lines.join("\n")
}

function confidenceNote(report: LocalAgentReport): string {
  if (report.summary.confidence === "high") {
    return "High confidence: token/cache telemetry and pricing coverage are strong for the parsed time window."
  }
  if (report.summary.confidence === "medium") {
    return "Medium confidence: token/cache direction is useful, but some agents or models are estimated or not priced."
  }
  return "Low confidence: some local fields are missing, estimated, or have unclear semantics. Use only the observed rows and evidence-backed findings as reliable."
}

function billingConfidence(report: LocalAgentReport): string {
  if (report.summary.coverage?.costTelemetry !== "full" || report.summary.coverage?.pricingCoverage !== "full") return "PARTIAL"
  if (report.summary.modelCostUsd === null || report.modelsDetected.some((model) => !model.pricingKnown)) return "PARTIAL"
  if (report.summary.tokenAccounting !== "observed") return "PARTIAL"
  return "MEDIUM"
}

function efficiencySignal(report: LocalAgentReport): string {
  if (report.summary.cacheLeakScore !== null && report.summary.cacheLeakScore < 60) return "HIGH"
  if (report.summary.cacheLeakScore !== null && report.summary.cacheLeakScore < 80) return "MEDIUM"
  const findings = report.findings.map((finding) => finding.id)
  if (findings.includes("dynamic-context-early") || findings.includes("long-sessions-no-summary")) return "MEDIUM"
  if (findings.includes("repeated-project-context") || findings.includes("weak-agents-md") || findings.includes("weak-claude-md")) return "LOW"
  return "LOW"
}

function mainSummary(report: LocalAgentReport): string {
  const agents = report.agents.filter((agent) => agent.sessionsAnalyzed > 0).map((agent) => agentName(agent.provider)).join(", ")
  const dynamicEarly = report.findings.find((finding) => finding.id === "dynamic-context-early")?.evidence
  const cache = report.summary.cacheReadPercent === null
    ? "Cache-read telemetry was not visible in the parsed local files."
    : `The observed ${observedCacheAgents(report)} cache profile is ${fmtPct(report.summary.cacheReadPercent)} (${cacheReadLabel(report.summary.cacheReadPercent).replace(/\u001b\[[0-9;]*m/g, "")}).`
  const limitation = report.agents.some((agent) => agent.sessionsAnalyzed > 0 && agent.cacheReadPercent === null)
    ? " Missing cache fields are not counted as 0%."
    : ""
  const issue = dynamicEarly
    ? `The main fixable signal is context hygiene in the transcript-visible sessions: ${dynamicEarly}`
    : report.summary.cacheLeakScore !== null && report.summary.cacheLeakScore >= 70
      ? "Overall context hygiene is healthy; only targeted evidence-backed fixes are shown."
      : "No high-confidence context-hygiene issue crossed the evidence threshold."
  return [
    `Cachecatch analyzed ${fmtInt(report.summary.sessionsAnalyzed)} local agent sessions${agents ? ` across ${agents}` : ""}. Token activity is ${report.summary.tokenAccounting}; cost telemetry is ${report.summary.coverage?.costTelemetry ?? "unavailable"} and pricing coverage is ${report.summary.coverage?.pricingCoverage ?? "unavailable"}.`,
    `${cache}${limitation} ${issue}`,
  ].join(" ")
}

function renderSupportShareCard(): string {
  return boxen([
    `${chalk.whiteBright("Support Cachecatch:")} copy and run ${chalk.cyanBright("npx cachecatch share")} to generate your share banner.`,
    chalk.gray("It will ask for your X handle, make the PNG, and print ready-to-use X copy/link."),
  ].join("\n"), {
    title: `${chalk.redBright("♥")} Support + Share`,
    titleAlignment: "left",
    borderStyle: "round",
    borderColor: "red",
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    width: Math.max(84, Math.min(118, process.stdout.columns || 110)),
  })
}

function findingRank(id: string): number {
  if (id === "dynamic-context-early") return 1
  if (id === "weak-agents-md" || id === "weak-claude-md") return 3
  if (id === "repeated-project-context") return 4
  if (id === "local-cache-telemetry-not-reported" || id === "no-cache-telemetry") return 5
  if (id === "unknown-model-pricing") return 6
  return 10
}

function rankedFindings(report: LocalAgentReport): LocalAgentReport["findings"] {
  return [...report.findings].sort((a, b) => findingRank(a.id) - findingRank(b.id))
}

function projectNextAction(project: LocalAgentReport["projects"][number]): string {
  if (!project.hasAgentsMd) {
    return `Add AGENTS.md to this repo. ${fmtInt(project.sessions)} sessions repeated project context without a stable instruction file.`
  }
  if (project.cacheReadPercent !== null && project.cacheReadPercent < 0.35) {
    return `Move logs, diffs, and terminal output below stable instructions. Observed cache read is only ${fmtPct(project.cacheReadPercent)} for this project.`
  }
  if (!project.hasClaudeMd) {
    return `If Claude Code is used here, add CLAUDE.md or point it to AGENTS.md so these ${fmtInt(project.sessions)} sessions share stable repo rules.`
  }
  return `Keep AGENTS.md/CLAUDE.md stable and move current-task state to the tail before the next ${fmtInt(project.sessions)}-session run.`
}

export function renderLocalAgentTerminalReport(
  report: LocalAgentReport,
  options: LocalTerminalReportOptions = {}
): string {
  const lines: string[] = []
  const noParsed = report.summary.sessionsAnalyzed === 0

  lines.push(chalk.cyanBright.bold("Cachecatch Local Agent Report"))
  lines.push(chalk.gray(`Generated ${report.generatedAt} · time window ${report.window}`))
  lines.push("")

  if (noParsed) {
    lines.push(metric("Status", report.summary.status ?? "Sessions found, but none could be parsed."))
    lines.push(metric("CONTEXT HYGIENE SCORE", "unavailable"))
    lines.push(metric("EFFICIENCY UPSIDE EST.", "unavailable"))
    lines.push(metric("ESTIMATED CACHE MISS RANGE", "unavailable"))
    lines.push(metric("AGENTS SCANNED", fmtInt(report.summary.agentsScanned)))
    lines.push(metric("SESSIONS FOUND", fmtInt(report.summary.sessionsFound)))
    lines.push(metric("SESSIONS IN TIME WINDOW", fmtInt(report.summary.sessionsInWindow)))
    lines.push("")
    lines.push(chalk.whiteBright("Main finding: ") + report.summary.mainFinding)
  } else {
    lines.push(chalk.whiteBright.bold("Main finding: ") + mainSummary(report))
    lines.push(chalk.gray(`Cachecatch found ${fmtInt(report.summary.sessionsFound)} stored sessions total and ${fmtInt(report.summary.sessionsInWindow)} sessions in this time window. "Analyzed" means Cachecatch could parse the session format safely.`))
    lines.push("")
    lines.push(miniBox("Builder Scorecard", [
      metric("AGENTIC SESSIONS", fmtInt(report.summary.sessionsAnalyzed), "parsed in this time window", 24),
      metric("TOKEN ACTIVITY", fmtInt(report.summary.totalTokens), report.summary.tokenAccounting === "mixed" ? "mixed observed/estimated" : tokenNote(report.summary.tokenAccounting), 24),
      metric("TOOL CALLS", fmtInt(report.summary.toolCalls), "observed where local storage exposes tool records", 24),
      metric("SUBAGENT RUNS", fmtInt(report.summary.subagentRuns), topSubagents(report.activity.topSubagents), 24),
      metric("IDE AGENTS USED", report.agents.filter((agent) => agent.sessionsAnalyzed > 0).map((agent) => agentName(agent.provider)).join(", ") || "none parsed", undefined, 24),
      metric("MODELS DETECTED", fmtInt(report.summary.modelsDetected), undefined, 24),
    ], report.summary.cacheReadPercent !== null && report.summary.cacheReadPercent >= 0.35 ? "green" : "yellow"))
    lines.push("")
    lines.push(miniBox("Cache Profile", [
      `${chalk.gray("CACHE READ PROFILE".padEnd(24))} ${chalk.whiteBright.bold(fmtPct(report.summary.cacheReadPercent))}  ${cacheReadLabel(report.summary.cacheReadPercent)}`,
      metric("CACHE READ TOKENS", fmtInt(report.summary.cacheReadTokens), report.summary.cacheReadPercent === null ? "not reported" : "observed", 24),
      metric("CACHE WRITE TOKENS", fmtInt(report.summary.cacheWriteTokens), report.summary.cacheReadPercent === null ? "not reported" : "observed", 24),
      metric("CACHE-TOKEN TELEMETRY", telemetryCoverage(report), undefined, 24),
      metric("COST TELEMETRY", report.summary.coverage?.costTelemetry ?? "unavailable", undefined, 24),
      metric("PRICING COVERAGE", report.summary.coverage?.pricingCoverage ?? "unavailable", undefined, 24),
      metric("TRANSCRIPT HYGIENE SIGNALS", report.findings.length > 0 ? "available" : report.summary.coverage?.transcriptCoverage === "unavailable" ? "not reported" : report.summary.coverage?.transcriptCoverage ?? "not reported", undefined, 24),
      "",
      detail("Scope", `${cacheScope(report)}.`, "cyan"),
      detail("Trust", "CacheCatch does not treat missing cache telemetry as zero. Missing fields are reported as not reported.", "yellow"),
      report.agents.some((agent) => agent.sessionsAnalyzed > 0 && agent.cacheReadPercent === null)
        ? detail("Limit", "Claude/Codex local transcripts are not counted as 0%.", "yellow")
        : detail("Basis", "Cache profile uses observed cache-token fields only.", "green"),
    ], report.summary.cacheReadPercent !== null && report.summary.cacheReadPercent >= 0.8 ? "green" : "cyan"))
    lines.push("")
    lines.push(miniBox("Context Hygiene", [
      `${chalk.gray("CONTEXT HYGIENE SCORE".padEnd(24))} ${chalk.whiteBright.bold(`${report.summary.cacheLeakScore} / 100`)}  ${healthLabel(report.summary.cacheLeakScore)}  ${scoreBar(report.summary.cacheLeakScore)}`,
      metric("EFFICIENCY UPSIDE SIGNAL", efficiencySignal(report), "based on evidence-backed hygiene findings", 24),
      metric("RESEARCH BENCHMARK RANGE", "41-80%", "cost reduction in agentic workloads; not this audit's claim", 24),
      metric("KNOWN MODEL COST", `${fmtUsd(report.summary.modelCostUsd)} equivalent`, report.summary.modelCostUsd === null ? "not reported" : "observed where local telemetry exposes cost", 24),
      report.summary.recoverableCashSaving
        ? metric("RECOVERABLE MODEL-COST GAP", `${fmtUsdRange(report.summary.recoverableCashSaving)} equivalent`, "capped to known eligible cost basis", 24)
        : metric("RECOVERABLE TOKEN GAP", report.summary.estimatedCacheMissRange ? `${report.summary.estimatedCacheMissRange.lowPercent}-${report.summary.estimatedCacheMissRange.highPercent}% signal` : "unavailable", "dollar estimate unavailable because cost/pricing coverage is partial", 24),
      metric("BILLING CONFIDENCE", billingConfidence(report), "subscriptions/promos/enterprise pricing not visible", 24),
      "",
      detail("Caveat", "Dollar values are model-cost equivalents only.", "yellow"),
      detail("Basis", report.summary.recoverableCashSaving ? "Dollar gap requires observed cost, known pricing, and known token semantics." : "Unpriced or partially priced token opportunity is not converted to dollars.", "cyan"),
      report.modelsDetected.some((model) => !model.pricingKnown)
        ? detail("Pricing", "Conservative cache-discount range used where exact cached-input price was unavailable.", "yellow")
        : detail("Pricing", "Built-in model pricing assumptions plus visible reusable-token signals.", "gray"),
    ], report.summary.cacheLeakScore !== null && report.summary.cacheLeakScore >= 70 ? "green" : report.summary.cacheLeakScore !== null && report.summary.cacheLeakScore >= 40 ? "yellow" : "red"))
    lines.push("")
    lines.push(miniBox("Report Confidence", [
      metric("Confidence", report.summary.confidence.toUpperCase(), undefined, 18),
      confidenceNote(report),
      "Use sessions, observed token/cache rows, model mix, and visible context-hygiene findings as the reliable parts. Unsafe dollar values are suppressed.",
      ...(report.summary.sanityWarnings?.length ? ["Sanity warnings:", ...report.summary.sanityWarnings.slice(0, 4).map((warning) => `- ${warning}`)] : []),
    ], report.summary.confidence === "high" ? "green" : report.summary.confidence === "medium" ? "yellow" : "red"))
  }

  lines.push("")
  lines.push(chalk.whiteBright.bold("■ IDE AGENT BREAKDOWN"))
  lines.push(chalk.gray("  Stored = all local sessions found. In time window = sessions whose modified/update time is inside the requested time window. Analyzed = parsed safely."))
  for (const agent of report.agents) {
    const status = agent.detected ? "detected" : "not detected"
    lines.push("")
    const color = agent.sessionsAnalyzed === 0 ? "yellow" : brandColor(agent.provider)
    const hygiene = agentHygieneValue(agent)
    const cacheTelemetry = cacheTelemetryLabel(agent)
    const cacheRead = cacheReadValue(agent)
    lines.push(miniBox(`${agentName(agent.provider)} (${status})`, [
      metric("Visibility", agentVisibility(agent), !agent.cacheFieldPresent && agent.sessionsAnalyzed > 0 ? "cache telemetry not reported" : undefined, 18),
      metric("Sessions", `${fmtInt(agent.sessionsAnalyzed)} analyzed`, `${fmtInt(agent.sessionsInWindow)} in time window · ${fmtInt(agent.sessionsFound)} stored`, 18),
      metric("Tokens", tokenFieldsUnclear(agent) ? "not reported" : fmtInt(agent.totalTokens), tokenFieldsUnclear(agent) ? "token fields present but semantics unclear" : tokenNote(agent.tokenAccounting, agent.provider), 18),
      metric("Cache telemetry", cacheTelemetry.value, cacheTelemetry.note, 18),
      metric("Cache read", cacheRead.value, cacheRead.note, 18),
      metric("Input tokens", tokenFieldsUnclear(agent) ? "not reported" : fmtInt(agent.inputTokens), tokenFieldsUnclear(agent) ? undefined : agent.tokenAccounting === "estimated" ? "estimated" : agent.inputTokens > 0 ? "observed" : "not reported", 18),
      metric("Cached input", agent.cacheFieldPresent ? fmtInt(agent.cacheReadTokens) : "not reported", agent.cacheFieldPresent && agent.cacheReadPercent === null ? "field present, semantics unclear" : agent.cacheFieldPresent ? "observed" : "missing cache field", 18),
      metric("Output tokens", tokenFieldsUnclear(agent) ? "not reported" : fmtInt(agent.outputTokens), tokenFieldsUnclear(agent) ? undefined : agent.tokenAccounting === "estimated" ? "estimated" : agent.outputTokens > 0 ? "observed" : "not reported", 18),
      metric("Cost", fmtUsd(agent.modelCostUsd), agent.modelCostUsd === null ? "not reported" : "observed/estimated from telemetry", 18),
      metric("Source", sourceLabel(agent), undefined, 18),
      metric("Context hygiene", hygiene.value, hygiene.note, 18),
      metric("Tool calls", fmtInt(agent.toolCalls), undefined, 18),
      metric("Subagents", fmtInt(agent.subagentRuns), topSubagents(agent.topSubagents), 18),
      metric("Top models", topModels(agent.modelsDetected), "ranked by parsed sessions", 18),
      `${chalk.gray("Finding".padEnd(18))} ${chalk.whiteBright(agent.mainFinding)}`,
    ], color as "cyan" | "green" | "yellow" | "red" | "gray"))
  }

  const setupHints = report.agents.map(setupHint).filter((hint): hint is string => Boolean(hint))
  if (setupHints.length > 0) {
    lines.push("")
    lines.push(chalk.whiteBright.bold("■ TELEMETRY SETUP"))
    lines.push(miniBox("Enable Future Exact Telemetry", [
      ...setupHints,
      "Then run `npx cachecatch daemon` while using the agent.",
    ], "cyan"))
  }

  if (!noParsed && report.projects.length > 0) {
    lines.push("")
    lines.push(chalk.whiteBright.bold("■ TOP PROJECTS"))
    lines.push(chalk.gray("  Project advice is based on the local project folders found in agent storage, plus AGENTS.md / CLAUDE.md presence."))
    for (const project of report.projects.slice(0, 3)) {
      lines.push("")
      lines.push(miniBox(project.path, [
        metric("Sessions", fmtInt(project.sessions), undefined, 18),
        metric("Token activity", fmtInt(project.totalTokens), undefined, 18),
        metric("Cache read", fmtPct(project.cacheReadPercent), project.cacheReadPercent === null ? "not reported" : "observed", 18),
        metric("AGENTS.md", project.hasAgentsMd ? "present" : "missing", project.hasAgentsMd ? "keep stable" : "add stable repo rules", 18),
        metric("CLAUDE.md", project.hasClaudeMd ? "present" : "missing", project.hasClaudeMd ? "Claude-specific rules available" : "optional unless Claude Code is used here", 18),
        `${chalk.cyanBright("→")} ${projectNextAction(project)}`,
      ], project.cacheReadPercent !== null && project.cacheReadPercent >= 0.35 ? "green" : "yellow"))
    }
  }

  const usefulFindings = rankedFindings(report)
  if (report.findings.length > 0) {
    lines.push("")
    lines.push(chalk.whiteBright.bold(noParsed ? "Finding" : "■ TOP FIXABLE ISSUES"))
    for (const finding of usefulFindings.slice(0, noParsed ? 1 : 6)) {
      const color = finding.severity === "high" ? "red" : finding.severity === "medium" ? "yellow" : "cyan"
      lines.push("")
      const whereParts: string[] = []
      const affectedMatch = finding.evidence.match(/^(\d+)\s+parsed/)
      const affectedCount = affectedMatch ? parseInt(affectedMatch[1], 10) : null
      if (finding.agent) {
        const agentSessions = report.agents.find((a) => a.provider === finding.agent)
        whereParts.push(agentName(finding.agent))
        if (agentSessions) whereParts.push(`${affectedCount !== null ? `${fmtInt(affectedCount)}/` : ""}${fmtInt(agentSessions.sessionsAnalyzed)} sessions`)
      } else {
        const activeAgents = report.agents.filter((a) => a.sessionsAnalyzed > 0).map((a) => agentName(a.provider))
        whereParts.push(activeAgents.join(" + ") || "all agents")
        whereParts.push(`${affectedCount !== null ? `${fmtInt(affectedCount)}/` : ""}${fmtInt(report.summary.sessionsAnalyzed)} sessions`)
      }
      const topProjects = report.projects.slice(0, 2).map((p) => p.path)
      if (topProjects.length > 0) whereParts.push(`top projects: ${topProjects.join(", ")}`)
      lines.push(miniBox(finding.title, [
        `${chalk.gray("What we found:")} ${finding.evidence}`,
        `${chalk.gray("Why it matters:")} ${findingWhy(finding.id)}`,
        `${chalk.gray("Where:")} ${whereParts.join(" · ")}`,
        `${chalk.gray("What to do next:")} ${finding.recommendation}`,
        `${chalk.gray("Validation:")} Rerun the same project/window and compare cache-read %, token activity basis, and whether this finding still appears.`,
      ], color as "cyan" | "green" | "yellow" | "red" | "gray"))
    }
  }

  if (!noParsed) {
    lines.push("")
    lines.push(chalk.whiteBright.bold("■ BEFORE / FIX / AFTER"))
    const visibleFinding = usefulFindings.find((finding) => finding.id !== "local-cache-telemetry-not-reported" && finding.id !== "no-cache-telemetry") ?? usefulFindings[0]
    lines.push(miniBox("1 BEFORE - Local Context Today", [
      `${chalk.redBright("×")} ${visibleFinding?.evidence ?? "Volatile context appears early in parsed sessions."}`,
      `${chalk.redBright("×")} ${visibleFinding ? findingWhy(visibleFinding.id) : "Only evidence-backed issues are shown in this section."}`,
    ], "red"))
    lines.push("")
    lines.push(miniBox("2 CACHECATCH FIX", [
      `${chalk.cyanBright("→")} Put stable repo identity, rules, tools, and output conventions in AGENTS.md / CLAUDE.md.`,
      `${chalk.cyanBright("→")} Keep that stable block byte-stable across sessions.`,
      `${chalk.cyanBright("→")} ${visibleFinding?.recommendation ?? "Move volatile task context after stable repo instructions only where the finding evidence applies."}`,
    ], "cyan"))
    lines.push("")
    lines.push(miniBox("3 AFTER - Cache-Ready Local Agent Workflow", [
      `${chalk.greenBright("✔")} Stable prefix first: role, repo rules, architecture constraints, command policy.`,
      `${chalk.greenBright("✔")} Dynamic tail last: task notes, terminal output, diffs, errors, current state.`,
      `${chalk.greenBright("✔")} Validation: rerun audit and compare observed cache-read %, token basis, and whether the same finding remains.`,
    ], "green"))

    lines.push("")
    lines.push(chalk.whiteBright.bold("■ PUBLIC SHARE SUMMARY"))
    lines.push(miniBox("Public Share Summary", [
      `${fmtInt(report.summary.sessionsAnalyzed)} agentic sessions in ${report.window}`,
      report.summary.tokenAccounting === "unavailable" ? "Token activity unavailable; public token claim suppressed" : `${fmtCompact(report.summary.totalTokens)} token activity analyzed · ${report.summary.tokenAccounting === "observed" ? "observed" : "mixed observed/estimated"}`,
      `${fmtInt(report.summary.toolCalls)} tool calls`,
      `${fmtInt(report.summary.subagentRuns)} subagent runs`,
      report.summary.cacheReadPercent === null ? "Cache-read profile not reported" : `${fmtPct(report.summary.cacheReadPercent)} observed cache-read profile`,
      `${fmtInt(report.summary.modelsDetected)} models detected`,
      "",
      "npx cachecatch share ./reports/<report>.json",
    ], "cyan"))

    lines.push("")
    lines.push(chalk.whiteBright.bold("■ AGENT REPAIR PROMPT"))
    for (const promptLine of repairPromptFromFindings(usefulFindings).split("\n")) {
      lines.push(chalk.gray(`  ${promptLine}`))
    }
  }

  if (options.debug) {
    lines.push("")
    lines.push(chalk.whiteBright.bold("Debug Diagnostics"))
    for (const provider of report.diagnostics.providers) {
      lines.push("")
      lines.push(chalk.whiteBright(`Provider: ${provider.provider}`))
      for (const root of provider.rootPaths) lines.push(chalk.gray(`Root path checked: ${root}`))
      lines.push(chalk.gray(`Candidate files found: ${provider.candidatesFound}`))
      lines.push(chalk.gray(`Recent candidates: ${provider.candidatesInWindow}`))
      lines.push(chalk.gray(`Files attempted: ${provider.filesAttempted}`))
      lines.push(chalk.gray(`Parsed successfully: ${provider.parsedSessions}`))
      if (provider.topFailureReasons.length > 0) {
        lines.push(chalk.gray("Top failure reasons:"))
        for (const reason of provider.topFailureReasons) lines.push(chalk.gray(`- ${reason.reason}: ${reason.count}`))
      }
      if (provider.sampleCandidates.length > 0) {
        lines.push(chalk.gray("Sample candidate files:"))
        provider.sampleCandidates.forEach((candidate, index) => {
          lines.push(chalk.gray(`${index + 1}. ${candidate.path}`))
          lines.push(chalk.gray(`   modified: ${candidate.modifiedAt ?? "unknown"}`))
          lines.push(chalk.gray(`   size: ${candidate.sizeBytes ?? "unknown"}`))
          lines.push(chalk.gray(`   parser: ${candidate.parserTried ?? "unknown"}`))
          lines.push(chalk.gray(`   result: ${candidate.parseStatus}`))
          if (candidate.parseReason) lines.push(chalk.gray(`   reason: ${candidate.parseReason}`))
          if (candidate.topLevelKeys?.length) lines.push(chalk.gray(`   top-level keys: ${candidate.topLevelKeys.join(", ")}`))
          if (candidate.eventTypes?.length) lines.push(chalk.gray(`   event types: ${candidate.eventTypes.join(", ")}`))
        })
      }
    }
  }

  lines.push("")
  lines.push(chalk.whiteBright.bold("■ DISCLAIMER"))
  lines.push(chalk.dim(report.pricingDisclaimer))

  const reportBox = boxen(lines.join("\n"), {
    title: " Cachecatch Local ",
    titleAlignment: "left",
    borderStyle: "round",
    borderColor: noParsed ? "yellow" : "cyan",
    padding: { top: 1, bottom: 1, left: 2, right: 2 },
    width: Math.max(84, Math.min(118, process.stdout.columns || 110)),
  })
  return noParsed ? reportBox : `${reportBox}\n\n${renderSupportShareCard()}`
}

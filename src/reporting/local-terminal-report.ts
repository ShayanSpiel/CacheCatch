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

function fmtMissRange(report: LocalAgentReport): string {
  const range = report.summary.estimatedCacheMissRange
  if (!range) return "unknown"
  return `${range.lowPercent}-${range.highPercent}%`
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

function tokenNote(kind: string): string {
  if (kind === "observed") return "observed from local agent telemetry"
  if (kind === "mixed") return "mixed: OpenCode observed, transcript-only agents estimated"
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
  if (report.summary.sessionsAnalyzed === 0) return "UNAVAILABLE"
  const analyzed = report.agents.filter((agent) => agent.sessionsAnalyzed > 0)
  if (analyzed.length === 0) return "UNAVAILABLE"
  const observed = analyzed.filter((agent) => agent.cacheReadPercent !== null)
  if (observed.length === 0) return "LIMITED"
  if (observed.length === analyzed.length) return "FULL"
  return "PARTIAL"
}

function agentVisibility(agent: LocalAgentReport["agents"][number]): string {
  if (agent.sessionsAnalyzed === 0) return "not detected"
  if (agent.cacheReadPercent !== null || agent.tokenAccounting === "observed") return "telemetry-rich"
  return "visibility limited"
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

function findingPrompt(id: string): string {
  if (id === "local-cache-telemetry-not-reported") {
    return "Inspect local session storage and report cache fields only when cache-read/cache-write tokens are explicitly present. Do not infer missing telemetry as zero cache."
  }
  if (id === "dynamic-context-early") {
    return "Rewrite my agent workflow so stable repo instructions load first, then task request, then logs/diffs/tool output at the very end."
  }
  if (id === "repeated-project-context") {
    return "Create or update AGENTS.md with stable repo rules, commands, architecture boundaries, and output conventions. Remove repeated repo boilerplate from task prompts."
  }
  if (id === "long-sessions-no-summary") {
    return "Summarize the previous session into goals, decisions, files touched, blockers, and next commands before continuing. Do not replay the full transcript."
  }
  if (id === "unknown-model-pricing") {
    return "Add or update the built-in pricing map for these detected model names, then rerun the audit. Do not scrape live prices silently during the report."
  }
  return "Make stable context explicit, keep it unchanged across sessions, and move volatile task context after it."
}

function confidenceNote(report: LocalAgentReport): string {
  if (report.summary.confidence === "high") {
    return "High confidence: token/cache telemetry and pricing coverage are strong for the parsed time window."
  }
  if (report.summary.confidence === "medium") {
    return "Medium confidence: token/cache direction is useful, but some agents or models are estimated or not priced."
  }
  return "Low confidence: some local agents expose transcripts without cache-token telemetry. Use token totals, session counts, and visible behavior findings as the reliable parts."
}

function billingConfidence(report: LocalAgentReport): string {
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
  const longSessions = report.findings.find((finding) => finding.id === "long-sessions-no-summary")?.evidence
  const dynamicEarly = report.findings.find((finding) => finding.id === "dynamic-context-early")?.evidence
  const cache = report.summary.cacheReadPercent === null
    ? "Cache-read telemetry was not visible in the parsed local files."
    : `The observed ${observedCacheAgents(report)} cache profile is ${fmtPct(report.summary.cacheReadPercent)} (${cacheReadLabel(report.summary.cacheReadPercent).replace(/\u001b\[[0-9;]*m/g, "")}).`
  const limitation = report.agents.some((agent) => agent.sessionsAnalyzed > 0 && agent.cacheReadPercent === null)
    ? " Local Claude/Codex cache telemetry is not visible, so it is not counted as 0%."
    : ""
  const issue = dynamicEarly
    ? `The main fixable signal is context hygiene in the transcript-visible sessions: ${dynamicEarly}`
    : longSessions
      ? `The main fixable signal is context hygiene in the transcript-visible sessions: ${longSessions}`
      : "The main fixable signal is keeping stable project instructions first and volatile logs/diffs last where transcript evidence exists."
  return [
    `You are an extreme local agent user: Cachecatch analyzed ${fmtInt(report.summary.sessionsAnalyzed)} coding-agent sessions, ${fmtCompact(report.summary.totalTokens)} token activity, ${fmtInt(report.summary.toolCalls)} tool calls, and ${fmtInt(report.summary.subagentRuns)} subagent runs${agents ? ` across ${agents}` : ""}.`,
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
  if (id === "long-sessions-no-summary") return 1
  if (id === "dynamic-context-early") return 2
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
      metric("TOKEN ACTIVITY", fmtInt(report.summary.totalTokens), tokenNote(report.summary.tokenAccounting), 24),
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
      metric("TELEMETRY COVERAGE", telemetryCoverage(report), undefined, 24),
      "",
      detail("Scope", `${cacheScope(report)}.`, "cyan"),
      report.agents.some((agent) => agent.sessionsAnalyzed > 0 && agent.cacheReadPercent === null)
        ? detail("Limit", "Claude/Codex local transcripts are not counted as 0%.", "yellow")
        : detail("Basis", "Cache profile uses observed cache-token fields only.", "green"),
    ], report.summary.cacheReadPercent !== null && report.summary.cacheReadPercent >= 0.8 ? "green" : "cyan"))
    lines.push("")
    lines.push(miniBox("Context Hygiene", [
      `${chalk.gray("CONTEXT HYGIENE SCORE".padEnd(24))} ${chalk.whiteBright.bold(`${report.summary.cacheLeakScore} / 100`)}  ${healthLabel(report.summary.cacheLeakScore)}  ${scoreBar(report.summary.cacheLeakScore)}`,
      metric("EFFICIENCY UPSIDE SIGNAL", efficiencySignal(report), "based on visible hygiene findings", 24),
      metric("RESEARCH BENCHMARK RANGE", "41-80%", "cost reduction in agentic workloads; not this audit's claim", 24),
      metric("EST. RAW MODEL COST", `${fmtUsd(report.summary.modelCostUsd)} equivalent`, "raw model pricing; sub/promo is NOT included", 24),
      metric("RECOVERABLE ESTIMATE", `${fmtUsdRange(report.summary.recoverableCashSaving)} equivalent`, report.summary.recoverableCashSaving ? "local model-cost equivalent" : "partial; pricing unavailable", 24),
      metric("BILLING CONFIDENCE", billingConfidence(report), "subscriptions/promos/enterprise pricing not visible", 24),
      "",
      detail("Caveat", "Dollar values are model-cost equivalents only.", "yellow"),
      detail("Basis", "Recoverable estimate = eligible repeated input-token estimate × model input/cache price delta × confidence factor.", "cyan"),
      report.modelsDetected.some((model) => !model.pricingKnown)
        ? detail("Pricing", "Conservative cache-discount range used where exact cached-input price was unavailable.", "yellow")
        : detail("Pricing", "Built-in model pricing assumptions plus visible reusable-token signals.", "gray"),
    ], report.summary.cacheLeakScore !== null && report.summary.cacheLeakScore >= 70 ? "green" : report.summary.cacheLeakScore !== null && report.summary.cacheLeakScore >= 40 ? "yellow" : "red"))
    lines.push("")
    lines.push(miniBox("Report Confidence", [
      metric("Confidence", report.summary.confidence.toUpperCase(), undefined, 18),
      confidenceNote(report),
      "Use sessions, token activity, tool calls, model mix, and visible context-hygiene findings as the reliable parts. Dollar values stay caveated.",
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
    lines.push(miniBox(`${agentName(agent.provider)} (${status})`, [
      metric("Visibility", agentVisibility(agent), agent.cacheReadPercent === null && agent.sessionsAnalyzed > 0 ? "cache telemetry not reported" : undefined, 18),
      metric("Sessions", `${fmtInt(agent.sessionsAnalyzed)} analyzed`, `${fmtInt(agent.sessionsInWindow)} in time window · ${fmtInt(agent.sessionsFound)} stored`, 18),
      metric("Tokens", fmtInt(agent.totalTokens), tokenNote(agent.tokenAccounting), 18),
      metric("Cache telemetry", agent.cacheReadPercent === null ? "not reported" : "observed", agent.cacheReadPercent === null ? "not exposed in local session files" : "local token fields present", 18),
      metric("Cache read", fmtPct(agent.cacheReadPercent), agent.cacheReadPercent === null ? "not exposed in local session files" : "observed", 18),
      metric("Context hygiene", hygiene.value, hygiene.note, 18),
      metric("Tool calls", fmtInt(agent.toolCalls), undefined, 18),
      metric("Subagents", fmtInt(agent.subagentRuns), topSubagents(agent.topSubagents), 18),
      metric("Top models", topModels(agent.modelsDetected), "ranked by parsed sessions", 18),
      `${chalk.gray("Finding".padEnd(18))} ${chalk.whiteBright(agent.mainFinding)}`,
    ], color as "cyan" | "green" | "yellow" | "red" | "gray"))
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
      lines.push(miniBox(finding.title, [
        `${chalk.gray("What we found:")} ${finding.evidence}`,
        `${chalk.gray("Why it matters:")} ${findingWhy(finding.id)}`,
        `${chalk.gray("Where:")} ${finding.agent ? agentName(finding.agent) : `${fmtInt(report.summary.sessionsAnalyzed)} analyzed sessions`}`,
        `${chalk.gray("What to do next:")} ${finding.recommendation}`,
        `${chalk.gray("Copy-paste agent prompt:")} ${findingPrompt(finding.id)}`,
      ], color as "cyan" | "green" | "yellow" | "red" | "gray"))
    }
  }

  if (!noParsed) {
    lines.push("")
    lines.push(chalk.whiteBright.bold("■ BEFORE / FIX / AFTER"))
    const visibleFinding = usefulFindings.find((finding) => finding.id !== "local-cache-telemetry-not-reported" && finding.id !== "no-cache-telemetry") ?? usefulFindings[0]
    lines.push(miniBox("1 BEFORE - Local Context Today", [
      `${chalk.redBright("×")} ${visibleFinding?.evidence ?? "Volatile context appears early in parsed sessions."}`,
      `${chalk.redBright("×")} Long sessions without summaries increase replayed context and reduce reusable-prefix discipline.`,
      `${chalk.redBright("×")} Missing or changing instruction files make stable project context harder to reuse.`,
    ], "red"))
    lines.push("")
    lines.push(miniBox("2 CACHECATCH FIX", [
      `${chalk.cyanBright("→")} Put stable repo identity, rules, tools, and output conventions in AGENTS.md / CLAUDE.md.`,
      `${chalk.cyanBright("→")} Keep that stable block byte-stable across sessions.`,
      `${chalk.cyanBright("→")} Move logs, diffs, stack traces, timestamps, current branch state, and tool output to the tail.`,
    ], "cyan"))
    lines.push("")
    lines.push(miniBox("3 AFTER - Cache-Ready Local Agent Workflow", [
      `${chalk.greenBright("✔")} Stable prefix first: role, repo rules, architecture constraints, command policy.`,
      `${chalk.greenBright("✔")} Dynamic tail last: task notes, terminal output, diffs, errors, current state.`,
      `${chalk.greenBright("✔")} Validation: rerun audit and compare observed cache-read %, estimated transcript tokens, and repeated-context findings.`,
    ], "green"))

    lines.push("")
    lines.push(chalk.whiteBright.bold("■ PUBLIC SHARE SUMMARY"))
    lines.push(miniBox("Public Share Summary", [
      `${fmtInt(report.summary.sessionsAnalyzed)} agentic sessions in ${report.window}`,
      `${fmtCompact(report.summary.totalTokens)} token activity`,
      `${fmtInt(report.summary.toolCalls)} tool calls`,
      `${fmtInt(report.summary.subagentRuns)} subagent runs`,
      `${fmtPct(report.summary.cacheReadPercent)} observed cache-read profile`,
      `${fmtInt(report.summary.modelsDetected)} models detected`,
      "",
      "npx cachecatch share ./reports/<report>.json",
    ], "cyan"))

    lines.push("")
    lines.push(chalk.whiteBright.bold("■ AGENT REPAIR PROMPT"))
    for (const promptLine of fixPrompt().split("\n")) {
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

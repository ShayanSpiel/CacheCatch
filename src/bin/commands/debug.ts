import { Command } from "commander"
import chalk from "chalk"
import { buildLocalAgentAudit } from "../../engine/index.ts"
import { coerceWindow, configureColor, withErrorHandling } from "../utils.ts"

function printTelemetry(agentName: "codex" | "claude-code", window: "24h" | "7d" | "30d" | "1y"): void {
  const report = buildLocalAgentAudit({ window, redact: true, debugSample: 100 })
  const agent = report.agents.find((item) => item.provider === agentName)
  const diagnostics = report.diagnostics.providers.find((item) => item.provider === agentName)
  const label = agentName === "claude-code" ? "Claude Code" : "Codex"

  process.stdout.write(chalk.cyanBright.bold(`${label} telemetry debug\n`))
  process.stdout.write(chalk.gray(`Window: ${window}\n\n`))
  process.stdout.write(`Files scanned: ${diagnostics?.candidatesFound ?? 0}\n`)
  process.stdout.write(`Sessions detected: ${agent?.sessionsFound ?? 0}\n`)
  process.stdout.write(`Files attempted: ${diagnostics?.filesAttempted ?? 0}\n`)
  process.stdout.write(`Parsed files: ${diagnostics?.parsedSessions ?? 0}\n`)
  process.stdout.write(`Visibility: ${agent?.visibility ?? "unavailable"}\n`)
  process.stdout.write(`Token fields found: ${agent && agent.inputTokens + agent.outputTokens > 0 ? "yes" : "no"}\n`)
  process.stdout.write(`Cache fields found: ${agent?.cacheFieldPresent ? "yes" : "no"}\n`)
  process.stdout.write(`Token events mode: ${agent?.confidenceNotes.find((note) => note.startsWith("Token event aggregation mode:"))?.replace("Token event aggregation mode: ", "").replace(".", "") ?? "not detected"}\n`)
  process.stdout.write(`Duplicate event count: ${agent?.confidenceNotes.find((note) => note.startsWith("Duplicate token event rows skipped:"))?.replace("Duplicate token event rows skipped: ", "").replace(".", "") ?? "0"}\n`)
  process.stdout.write(`OTel/local overlap: ${agent?.telemetrySources.includes("otel_logs") && agent.telemetrySources.includes("local_jsonl") ? "possible; normalized rows are deduped by session/model/timestamp/token values" : "not detected"}\n`)
  process.stdout.write(`Models found: ${agent?.modelsDetected.length ? agent.modelsDetected.join(", ") : "not reported"}\n`)
  process.stdout.write(`Sessions upgraded from transcript-only: ${agent && agent.visibility !== "transcript_context_only" && agent.sessionsAnalyzed > 0 ? agent.sessionsAnalyzed : 0}\n`)
  if (agent?.confidenceNotes.length) {
    process.stdout.write("\nObserved fields:\n")
    for (const note of agent.confidenceNotes) process.stdout.write(`- ${note}\n`)
  }
  if (agent?.metrics) {
    process.stdout.write("\nFinal aggregation basis:\n")
    for (const [name, metric] of Object.entries(agent.metrics)) {
      process.stdout.write(`- ${name}: ${metric.value ?? "not reported"} ${metric.unit}; ${metric.telemetryKind}; confidence=${metric.confidence}; included=${metric.includedInGlobalTotal}\n`)
    }
  }
  if (diagnostics?.sampleCandidates.length) {
    process.stdout.write("\nEvent schemas detected:\n")
    for (const candidate of diagnostics.sampleCandidates.slice(0, 20)) {
      const schema = [
        candidate.eventTypes?.join(", ") || "unknown events",
        candidate.topLevelKeys?.length ? `keys: ${candidate.topLevelKeys.join(", ")}` : undefined,
      ].filter(Boolean).join(" | ")
      process.stdout.write(`- ${candidate.path}: ${candidate.parseStatus}${schema ? ` (${schema})` : ""}\n`)
    }
  }
}

export function makeDebugCommand(): Command {
  const cmd = new Command("debug")
    .description("Inspect local telemetry parser visibility without printing raw prompts.")
    .option("-w, --window <window>", "Time window: 24h | 7d | 30d | 1y", "7d")
    .option("--no-color", "Disable terminal colors")

  cmd.command("codex-telemetry")
    .description("Show Codex telemetry files, schemas, and token/cache fields detected.")
    .action(async (_subFlags: unknown, command: Command) => {
      await withErrorHandling(async () => {
        const flags = command.parent?.opts<{ window: string; color?: boolean }>() ?? { window: "7d" }
        configureColor(flags.color !== false)
        printTelemetry("codex", coerceWindow(flags.window))
      })
    })

  cmd.command("claude-telemetry")
    .description("Show Claude Code telemetry files, schemas, and token/cache fields detected.")
    .action(async (_subFlags: unknown, command: Command) => {
      await withErrorHandling(async () => {
        const flags = command.parent?.opts<{ window: string; color?: boolean }>() ?? { window: "7d" }
        configureColor(flags.color !== false)
        printTelemetry("claude-code", coerceWindow(flags.window))
      })
    })

  return cmd
}

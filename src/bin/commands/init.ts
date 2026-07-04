import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { Command } from "commander"
import chalk from "chalk"
import { configureColor, withErrorHandling } from "../utils.ts"

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-")
}

function upsertCodexOtelConfig(existing: string): string {
  const otelBlock = [
    "[otel]",
    'environment = "cachecatch-local"',
    "log_user_prompt = false",
    "exporter = { otlp-http = {",
    '  endpoint = "http://127.0.0.1:4318/v1/logs",',
    '  protocol = "binary"',
    "}}",
  ].join("\n")
  const withoutOtel = existing.replace(/\n?\[otel\][\s\S]*?(?=\n\[[^\]]+\]|\s*$)/m, "").trimEnd()
  return `${withoutOtel}${withoutOtel ? "\n\n" : ""}${otelBlock}\n`
}

function initCodex(): void {
  const configPath = join(homedir(), ".codex", "config.toml")
  mkdirSync(dirname(configPath), { recursive: true })
  const existing = existsSync(configPath) ? readFileSync(configPath, "utf-8") : ""
  if (existsSync(configPath)) {
    const backupPath = `${configPath}.cachecatch-backup-${timestamp()}`
    writeFileSync(backupPath, existing, "utf-8")
    process.stdout.write(chalk.gray(`Backed up existing config to ${backupPath}\n`))
  }
  writeFileSync(configPath, upsertCodexOtelConfig(existing), "utf-8")
  process.stdout.write(chalk.greenBright("Codex OTel config updated.\n"))
  process.stdout.write("Run:\n")
  process.stdout.write(chalk.cyan("  npx --yes cachecatch daemon\n"))
  process.stdout.write(chalk.cyan("  codex\n"))
  process.stdout.write(chalk.gray("Prompts are redacted by default via log_user_prompt=false. The endpoint is localhost only.\n"))
}

function initClaude(includeToolDetails: boolean): void {
  const dir = join(homedir(), ".cachecatch")
  mkdirSync(dir, { recursive: true })
  const envPath = join(dir, "claude-code-otel.env")
  const lines = [
    "export CLAUDE_CODE_ENABLE_TELEMETRY=1",
    "export OTEL_METRICS_EXPORTER=otlp",
    "export OTEL_LOGS_EXPORTER=otlp",
    "export OTEL_EXPORTER_OTLP_PROTOCOL=http/json",
    "export OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318",
    "export OTEL_METRIC_EXPORT_INTERVAL=10000",
    "export OTEL_LOGS_EXPORT_INTERVAL=5000",
  ]
  if (includeToolDetails) lines.push("export OTEL_LOG_TOOL_DETAILS=1")
  writeFileSync(envPath, `${lines.join("\n")}\n`, "utf-8")
  process.stdout.write(chalk.greenBright(`Claude Code OTel env file written to ${envPath}\n`))
  process.stdout.write("Run:\n")
  process.stdout.write(chalk.cyan(`  source ${envPath}\n`))
  process.stdout.write(chalk.cyan("  npx --yes cachecatch daemon\n"))
  process.stdout.write(chalk.cyan("  claude\n"))
  process.stdout.write(chalk.gray("Raw prompts, assistant responses, tool content, and raw API bodies are not enabled by default.\n"))
}

export function makeInitCommand(): Command {
  const cmd = new Command("init")
    .description("Configure local agent telemetry collection.")
    .option("--no-color", "Disable terminal colors")

  cmd.command("codex")
    .description("Enable future Codex OTel telemetry to the local Cachecatch daemon.")
    .action(async (_opts: unknown, command: Command) => {
      await withErrorHandling(async () => {
        configureColor(command.parent?.opts<{ color?: boolean }>().color !== false)
        initCodex()
      })
    })

  cmd.command("claude")
    .description("Create a Claude Code OTel env file with safe local defaults.")
    .option("--include-tool-details", "Include Claude Code tool detail telemetry.")
    .action(async (opts: { includeToolDetails?: boolean }, command: Command) => {
      await withErrorHandling(async () => {
        configureColor(command.parent?.opts<{ color?: boolean }>().color !== false)
        initClaude(Boolean(opts.includeToolDetails))
      })
    })

  return cmd
}

/**
 * `cachecatch audit` — fetch traces from a provider, run the engine,
 * render a beautiful terminal report, and optionally export HTML/JSON.
 *
 * Production features:
 *   - Interactive prompt for missing API keys (no TTY = fail loud)
 *   - Clear screen for an app-like first impression
 *   - Spinner with stage updates while fetching + analyzing
 *   - Responsive terminal width
 *   - Optional `--copy` to put the fix plan on the clipboard
 *   - Post-run summary pointing at the shareable export
 */

import { Command } from "commander"
import chalk from "chalk"
import ora from "ora"
import clipboardy from "clipboardy"
import { getAdapter, ADAPTERS } from "../../adapters/index.ts"
import { buildLocalAgentAudit, buildReport } from "../../engine/index.ts"
import {
  renderLocalAgentTerminalReport,
  renderCompactSummary,
  setTerminalWidth,
} from "../../reporting/index.ts"
import {
  writeReportToFile,
  writeTerminalReport,
  coerceReportFormat,
  coerceWindow,
  coerceLimit,
  configureColor,
  fail,
  withErrorHandling,
  autoSaveJsonReport,
  autoSaveLocalAgentReport,
  writeLocalAgentReportToFile,
  streamWordByWord,
} from "../utils.ts"
import { resolveApiKey, NonInteractiveError } from "../prompts.ts"
import { promptForProject } from "../prompts.ts"
import type { AuditOptions, Provider } from "../../types/index.ts"
import { loadDotenv } from "../../util/http.ts"

interface AuditFlags {
  provider: Provider
  project?: string
  window: string
  key?: string
  baseUrl?: string
  limit?: string
  out?: string
  format?: "html" | "json"
  json?: boolean | string
  redact?: boolean
  compact?: boolean
  full?: boolean
  explainMath?: boolean
  showAgentPrompt?: boolean
  instant?: boolean
  debug?: boolean
  verbose?: boolean
  debugSample?: string
  yes?: boolean
  copy?: boolean
  noClear?: boolean
  color?: boolean
}

function envVarForProvider(provider: Provider): string | null {
  switch (provider) {
    case "langsmith":
      return "LANGSMITH_API_KEY"
    case "langfuse":
      return "LANGFUSE_PUBLIC_KEY"
    case "braintrust":
      return "BRAINTRUST_API_KEY"
    default:
      return null
  }
}

function clearScreen(): void {
  process.stdout.write("\x1Bc")
}

function printPostRunSummary(
  report: { projectName: string; source: string },
  exportedTo?: string,
  autoSavedPath?: string
): void {
  const lines: string[] = []
  lines.push("")
  lines.push(chalk.gray("─".repeat(Math.min(60, process.stdout.columns || 60))))
  lines.push(chalk.cyanBright.bold("⚡ Audit complete."))
  if (exportedTo) {
    lines.push(
      chalk.gray(`  → Report saved: ${chalk.cyan(exportedTo)}`)
    )
  }
  if (autoSavedPath) {
    lines.push(
      chalk.gray(`  → Auto-saved JSON: ${chalk.cyan(autoSavedPath)}`)
    )
  }
  lines.push(
    chalk.gray(
      `  → Re-run with --window 30d --limit 500 for a wider sample.`
    )
  )
  lines.push("")
  lines.push(chalk.whiteBright("  Next — copy/paste this exact line:"))
  lines.push("")
  lines.push(
    "    " + chalk.cyan.bold(`npx --yes cachecatch@latest share --handle @yourname`)
  )
  lines.push("")
  lines.push(
    chalk.gray(
      "  The --yes flag is required to skip npx's install prompt.\n" +
      "  Omit --handle to be prompted for it interactively."
    )
  )
  lines.push("")
  process.stdout.write(lines.join("\n"))
}

function printLocalPostRunSummary(
  report: { summary: { sessionsAnalyzed?: number; totalTokens?: number } },
  autoSavedPath: string
): void {
  const lines: string[] = []
  lines.push("")
  lines.push(chalk.gray("─".repeat(Math.min(60, process.stdout.columns || 60))))
  lines.push(chalk.cyanBright.bold("⚡ Local audit complete."))
  lines.push(
    chalk.gray(
      `  → Sessions analyzed: ${chalk.whiteBright(
        Math.round(report.summary.sessionsAnalyzed ?? 0).toLocaleString("en-US")
      )}`
    )
  )
  if (autoSavedPath) {
    lines.push(
      chalk.gray(`  → Auto-saved JSON: ${chalk.cyan(autoSavedPath)}`)
    )
  }
  lines.push(
    chalk.gray(
      `  → Re-run with --window 30d for a wider sample of your agent sessions.`
    )
  )
  lines.push("")
  lines.push(chalk.whiteBright("  Next — copy/paste this exact line:"))
  lines.push("")
  lines.push(
    "    " + chalk.cyan.bold(`npx --yes cachecatch@latest share --handle @yourname`)
  )
  lines.push("")
  lines.push(
    chalk.gray(
      "  The --yes flag is required to skip npx's install prompt.\n" +
      "  Omit --handle to be prompted for it interactively."
    )
  )
  lines.push("")
  process.stdout.write(lines.join("\n"))
}

export function makeAuditCommand(): Command {
  const cmd = new Command("audit")
    .description(
      "Audit a project's prompt-cache efficiency. Fetches traces from a provider and prints a report."
    )
    .argument("[project]", "Project name, ID, or LangSmith URL")
    .option("-p, --provider <provider>", "Provider: langsmith | langfuse | braintrust", "langsmith")
    .option("--project <path>", "Project path for local audits")
    .option("-w, --window <window>", "Time window: 24h | 7d | 30d | 1y", "7d")
    .option("-k, --key <key>", "API key (or use env vars)")
    .option("--base-url <url>", "Override provider base URL (self-hosted / EU region)")
    .option("-l, --limit <n>", "Max traces to fetch (1-10000)", "300")
    .option("-o, --out <path>", "Write report to file")
    .option("-f, --format <fmt>", "Output format: html | json", "html")
    .option("--json [path]", "Print raw JSON to stdout, or write local audit JSON to a path")
    .option("--redact", "Redact sensitive local transcript content before analysis", true)
    .option("--no-redact", "Disable redaction for local transcript analysis")
    .option("--compact", "Print compact summary only")
    .option("--full", "Show all route diagnostics and the full agent repair prompt")
    .option("--explain-math", "Show full calculation details")
    .option("--show-agent-prompt", "Show the full agent repair prompt")
    .option("--instant", "Print the full report immediately instead of streaming sections")
    .option("--debug", "Show local audit discovery and parser diagnostics")
    .option("--verbose", "Show local audit discovery and parser diagnostics")
    .option("--debug-sample <n>", "Number of local candidate diagnostics to show per provider", "20")
    .option("-c, --copy", "Copy the fix plan JSON to the system clipboard")
    .option("--no-clear", "Skip the initial screen clear")
    .option("--no-color", "Disable terminal colors")
    .option("-y, --yes", "Skip confirmation prompts")
    .action(async (projectArg: string | undefined, flags: AuditFlags) => {
      await withErrorHandling(async () => {
        const colorEnabled = flags.color !== false
        const noColorRequested = !colorEnabled || process.argv.includes("--no-color") || Boolean(process.env.NO_COLOR)
        configureColor(colorEnabled)
        loadDotenv()

        // Make the report responsive to the current terminal width
        setTerminalWidth(process.stdout.columns || 100)

        // Clear screen for an app-like first impression
        if (flags.noClear !== false && process.stdout.isTTY) {
          clearScreen()
        }

        const provider = flags.provider
        if (!ADAPTERS[provider]) {
          fail(
            `Unknown provider "${provider}". Supported: ${Object.keys(ADAPTERS)
              .filter((k) => k !== "mock" && k !== "sample")
              .join(", ")}`
          )
        }

        const window = coerceWindow(flags.window)

        if (projectArg?.trim() === "local") {
          process.stderr.write(chalk.dim("Scanning local agent sessions...\n"))

          const report = buildLocalAgentAudit({
            window,
            project: flags.project,
            redact: flags.redact !== false,
            debugSample: flags.debugSample ? coerceLimit(flags.debugSample) : 20,
          })

          const jsonPath = typeof flags.json === "string" ? flags.json : flags.out
          const savedPath = jsonPath
            ? writeLocalAgentReportToFile(report, jsonPath)
            : autoSaveLocalAgentReport(report)

          if (flags.json === true) {
            process.stdout.write(JSON.stringify(report, null, 2) + "\n")
          } else {
            process.stderr.write(chalk.green("✔ ") + chalk.greenBright("⚡ Generating report\n"))
            const text = renderLocalAgentTerminalReport(report, {
              debug: Boolean(flags.debug || flags.verbose),
            })
            if (process.stdout.isTTY && !process.env.CI) {
              await streamWordByWord(text, 20)
              process.stdout.write("\n")
            } else {
              process.stdout.write(text)
            }
            printLocalPostRunSummary(report, savedPath)
          }
          return
        }

        const limit = flags.limit ? coerceLimit(flags.limit) : 300
        const adapter = getAdapter(provider)
        let project = projectArg?.trim()
        if (!project) {
          try {
            project = await promptForProject(adapter.displayName)
          } catch (e) {
            if (e instanceof NonInteractiveError) {
              fail(
                "Missing project. Pass it as `npx cachecatch audit <project>` when running non-interactively."
              )
            }
            throw e
          }
        }
        if (!project) {
          fail("Missing project.")
        }

        // ---- Resolve API key (CLI > env > interactive) ----------------
        const envVar = envVarForProvider(provider)
        let apiKey: string
        try {
          apiKey = await resolveApiKey(provider, envVar ?? "", flags.key)
        } catch (e) {
          if (e instanceof NonInteractiveError) {
            fail(e.message)
          }
          throw e
        }
        if (!apiKey || apiKey.length === 0) {
          fail(
            `Missing ${provider} credentials. Pass --key or set ${
              envVar ?? "the env var"
            }.`
          )
        }

        const opts: AuditOptions = {
          project,
          provider,
          window,
          apiKey,
          baseUrl: flags.baseUrl,
          limit,
        }

        // ---- Spinner: fetch + analyze -------------------------------
        const spinner = flags.json || noColorRequested
          ? null
          : ora({
              text: chalk.cyan(`Connecting to ${adapter.displayName}...`),
              color: "cyan",
              isEnabled: !noColorRequested,
            }).start()

        let result
        try {
          result = await adapter.fetchTraces({
            project,
            apiKey: opts.apiKey,
            window,
            limit,
            baseUrl: opts.baseUrl,
          })
        } catch (e) {
          spinner?.fail(chalk.redBright("Fetch failed"))
          throw e
        }

        if (result.traces.length === 0) {
          fail(
            `No trace data found for "${project}" in the ${window} window. Try a wider --window, check the project name, or run projects --provider ${provider}.`
          )
        }

        if (spinner) {
          spinner.text = chalk.cyan(
            `Analyzing ${result.traces.length} trace${
              result.traces.length === 1 ? "" : "s"
            }...`
          )
        }

        const report = buildReport(result.traces, {
          projectName: result.projectName,
          projectUrl: result.projectUrl,
          window,
          source: provider,
        })

        // ---- Render (spinner transitions directly into streaming) ----
        if (spinner) {
          spinner.succeed(chalk.greenBright("⚡ Generating report"))
        }

        let exportedTo: string | undefined
        if (flags.json) {
          process.stdout.write(JSON.stringify(report, null, 2) + "\n")
        } else if (flags.compact) {
          process.stdout.write("\n" + renderCompactSummary(report) + "\n")
        } else {
          await writeTerminalReport(
            report,
            {
              full: flags.full,
              explainMath: flags.explainMath,
              showAgentPrompt: flags.showAgentPrompt,
            },
            !flags.instant
          )
        }

        // ---- Auto-save JSON report to reports folder ----------------
        const autoSavedPath = autoSaveJsonReport(report)

        // ---- Optional exports ---------------------------------------
        if (flags.out) {
          const format = coerceReportFormat(flags.format || "html")
          exportedTo = writeReportToFile(report, flags.out, format)
          process.stdout.write(
            chalk.greenBright(`\n✔ Report written to ${exportedTo}\n`)
          )
        }

        // ---- Optional clipboard copy --------------------------------
        if (flags.copy) {
          try {
            const fixJson = JSON.stringify(
              { fixPlan: report.fixPlan, summary: report.summary },
              null,
              2
            )
            await clipboardy.write(fixJson)
            process.stdout.write(
              chalk.greenBright("✔ Fix plan copied to clipboard\n")
            )
          } catch (e) {
            process.stdout.write(
              chalk.yellow(
                `⚠ Could not copy to clipboard: ${
                  e instanceof Error ? e.message : String(e)
                }\n`
              )
            )
          }
        }

        // ---- Post-run summary ---------------------------------------
        if (!flags.json) {
          printPostRunSummary(
            { projectName: report.projectName, source: report.source },
            exportedTo,
            autoSavedPath
          )
        }
      })
    })

  return cmd
}

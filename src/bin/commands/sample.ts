/**
 * `cachecatch sample` — generate a beautiful sample audit using the
 * mock adapter. No API keys, no network. Perfect for first-run demos
 * and CI smoke tests.
 */

import { Command } from "commander"
import chalk from "chalk"
import ora from "ora"
import { sampleReport } from "../../../lib/cachecatch/sample-data.ts"
import { renderCompactSummary } from "../../reporting/index.ts"
import {
  coerceReportFormat,
  configureColor,
  writeTerminalReport,
  writeReportToFile,
  autoSaveJsonReport,
  withErrorHandling,
} from "../utils.ts"

interface SampleFlags {
  project?: string
  window: string
  out?: string
  format?: "html" | "json"
  json?: boolean
  compact?: boolean
  full?: boolean
  explainMath?: boolean
  showAgentPrompt?: boolean
  color?: boolean
  instant?: boolean
  reset?: boolean
}

export function makeSampleCommand(): Command {
  const cmd = new Command("sample")
    .description(
      "Generate a sample audit using built-in mock data. No API keys required."
    )
    .option("--project <name>", "Project name to display", "Acme Enterprise Support Copilot")
    .option("-w, --window <window>", "Time window label (24h | 7d | 30d | 1y)", "7d")
    .option("-o, --out <path>", "Write report to file")
    .option("-f, --format <fmt>", "Output format: html | json", "html")
    .option("--json", "Print raw JSON to stdout")
    .option("--compact", "Print compact summary only")
    .option("--full", "Show all route diagnostics")
    .option("--explain-math", "Show full calculation details")
    .option("--show-agent-prompt", "Show the full agent repair prompt")
    .option("--instant", "Print the full report immediately instead of streaming sections")
    .option("--no-color", "Disable terminal colors")
    .option("--reset", "Re-generate the underlying mock dataset")
    .action(async (flags: SampleFlags) => {
      await withErrorHandling(async () => {
        configureColor(flags.color !== false)

        const spinner = flags.json
          ? null
          : ora({
              text: chalk.cyan("Loading sample data..."),
              color: "cyan",
              isEnabled: flags.color !== false,
            }).start()

        if (spinner) {
          spinner.text = chalk.cyan("Analyzing sample enterprise trace set...")
        }

        const report = {
          ...sampleReport,
          projectName: flags.project || sampleReport.projectName,
          window: (flags.window as "24h" | "7d" | "30d" | "1y") || sampleReport.window,
        }

        if (spinner) {
          spinner.succeed(
            chalk.greenBright(
              `Sample ready: ${report.summary.runsAnalyzed} traces, ${report.summary.routesAnalyzed} routes`
            )
          )
        }

        if (flags.json) {
          process.stdout.write(JSON.stringify(report, null, 2) + "\n")
        } else if (flags.compact) {
          process.stdout.write(renderCompactSummary(report) + "\n")
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

        if (flags.out) {
          const format = coerceReportFormat(flags.format || "html")
          const out = writeReportToFile(report, flags.out, format)
          process.stdout.write(
            chalk.greenBright(`\n✔ Report written to ${out}\n`)
          )
        } else if (!flags.json && !flags.compact) {
          const autoSavedPath = autoSaveJsonReport(report)
          process.stdout.write(
            chalk.gray(`\n  → Auto-saved JSON: ${chalk.cyan(autoSavedPath)}\n`)
          )
          process.stdout.write(
            chalk.gray("  → Save JSON: npx cachecatch sample --format json --out ./cachecatch-report.json\n")
          )
          process.stdout.write(
            chalk.gray("  → Save HTML: npx cachecatch sample --out ./cachecatch-report.html\n")
          )
        }

        if (flags.reset) {
          process.stdout.write(
            chalk.gray("Sample data is deterministic; --reset is kept for CLI compatibility.\n")
          )
        }
      })
    })

  return cmd
}

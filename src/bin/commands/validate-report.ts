import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { Command } from "commander"
import chalk from "chalk"
import { validateLocalAgentReport } from "../../engine/index.ts"
import type { LocalAgentReport } from "../../types/index.ts"
import { configureColor, withErrorHandling } from "../utils.ts"

function isLocalReport(value: unknown): value is LocalAgentReport {
  return Boolean(value && typeof value === "object" && (value as { reportType?: unknown }).reportType === "local-agent-context-audit")
}

export function makeValidateReportCommand(): Command {
  return new Command("validate-report")
    .description("Validate a saved report JSON for unsafe local report metrics.")
    .argument("<input>", "Path to a saved local report JSON")
    .option("--no-color", "Disable terminal colors")
    .action(async (input: string, flags: { color?: boolean }) => {
      await withErrorHandling(async () => {
        configureColor(flags.color !== false)
        const path = resolve(input)
        const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown
        if (!isLocalReport(parsed)) {
          throw new Error("validate-report currently supports local-agent-context-audit reports.")
        }
        const warnings = validateLocalAgentReport(parsed)
        if (warnings.length === 0) {
          process.stdout.write(chalk.greenBright("Report invariants passed.\n"))
          return
        }
        process.stdout.write(chalk.yellowBright(`Report has ${warnings.length} unsafe render decision(s):\n`))
        for (const warning of warnings) process.stdout.write(`- ${warning}\n`)
        process.exitCode = 1
      })
    })
}

#!/usr/bin/env node
/**
 * Cachecatch CLI — entry point.
 *
 * Usage:
 *   cachecatch sample                          # demo report (no API key)
 *   cachecatch audit my-project --provider langsmith
 *   cachecatch audit my-project --provider langfuse
 *   cachecatch audit my-project --provider braintrust --window 30d
 *   cachecatch projects --provider langsmith   # list available projects
 *   cachecatch config set-key langsmith lsv2_…
 *   cachecatch export ./report.json --format html --out ./report.html
 *
 * The CLI is intentionally thin. The real work happens in:
 *   src/adapters/*  — provider I/O
 *   src/engine/*    — provider-agnostic analysis
 *   src/reporting/* — terminal + HTML output
 */

import { Command } from "commander"
import chalk from "chalk"
import { APP_NAME, APP_VERSION } from "../engine/constants.ts"
import { makeAuditCommand } from "./commands/audit.ts"
import { makeSampleCommand } from "./commands/sample.ts"
import { makeExportCommand } from "./commands/export.ts"
import { makeProjectsCommand } from "./commands/projects.ts"
import { makeConfigCommand } from "./commands/config.ts"
import { makeShareCommand } from "./commands/share.ts"
import { makeDebugCommand } from "./commands/debug.ts"
import { makeInitCommand } from "./commands/init.ts"
import { makeDaemonCommand, makeRunCommand, makeTelemetryCommand } from "./commands/daemon.ts"
import { makeValidateReportCommand } from "./commands/validate-report.ts"

if (process.argv.includes("--no-color") || process.env.NO_COLOR) {
  chalk.level = 0
}

const program = new Command()

program
  .name("cachecatch")
  .description(
    `${APP_NAME} — Prompt CacheOps. Audit, detect, and fix prompt-cache breakers across LLM observability providers.`
  )
  .version(APP_VERSION, "-v, --version")
  .option("--no-color", "Disable terminal colors")
  .showHelpAfterError()

program.addCommand(makeAuditCommand())
program.addCommand(makeSampleCommand())
program.addCommand(makeExportCommand())
program.addCommand(makeProjectsCommand())
program.addCommand(makeConfigCommand())
program.addCommand(makeShareCommand())
program.addCommand(makeDebugCommand())
program.addCommand(makeInitCommand())
program.addCommand(makeDaemonCommand())
program.addCommand(makeTelemetryCommand())
program.addCommand(makeRunCommand())
program.addCommand(makeValidateReportCommand())

program
  .command("version", { hidden: true })
  .action(() => {
    process.stdout.write(`${APP_NAME} v${APP_VERSION}\n`)
  })

  // Friendly help when invoked with no subcommand
  const CMD = "npx cachecatch"
  if (process.argv.length <= 2) {
    process.stdout.write(
      `\n${chalk.cyanBright.bold("⚡ " + APP_NAME)} ${chalk.gray(
        "v" + APP_VERSION
      )} — Prompt CacheOps\n\n`
    )
    process.stdout.write(
      `${chalk.whiteBright("Quick start:")}\n` +
        `  ${chalk.cyan(`${CMD} sample`)}                          ${chalk.gray(
          "Demo report (no API key)"
        )}\n` +
        `  ${chalk.cyan(`${CMD} audit <project>`)}                  ${chalk.gray(
          "Audit a LangSmith project"
        )}\n` +
        `  ${chalk.cyan(`${CMD} projects --provider langsmith`)}    ${chalk.gray(
          "List available projects"
        )}\n` +
        `  ${chalk.cyan(`${CMD} config set-key langsmith <key>`)}   ${chalk.gray(
          "Save your API key"
        )}\n\n` +
        `Run ${chalk.cyan(`${CMD} --help`)} for the full command list.\n` +
        `From a local clone use ${chalk.cyan("npm run cachecatch")}.\n\n`
    )
    process.exit(0)
  }

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write("\n" + chalk.bgRed.whiteBright.bold(" FATAL ") + " ")
  process.stderr.write(chalk.redBright(err instanceof Error ? err.message : String(err)) + "\n")
  if (err instanceof Error && err.stack && process.env.DEBUG) {
    process.stderr.write(chalk.gray(err.stack) + "\n")
  }
  process.exit(1)
})

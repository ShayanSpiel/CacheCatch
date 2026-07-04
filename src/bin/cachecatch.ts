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
// share.ts is lazy-loaded below to avoid pulling @inquirer/prompts into
// every CLI invocation (it uses node:util styleText which breaks Node 18).
import { makeDebugCommand } from "./commands/debug.ts"
import { makeInitCommand } from "./commands/init.ts"
import { makeDaemonCommand, makeRunCommand, makeTelemetryCommand } from "./commands/daemon.ts"
import { makeValidateReportCommand } from "./commands/validate-report.ts"
import { prewarmChrome } from "../reporting/html-to-png.ts"

if (process.argv.includes("--no-color") || process.env.NO_COLOR) {
  chalk.level = 0
}

// Strip leading "--" so npx invocations like "npx cachecatch -- audit local" work
if (process.argv[2] === "--") {
  process.argv.splice(2, 1)
}

// Pre-warm Chrome in the background so the next `cachecatch share` runs
// instantly. Skipped for --help / --version so those stay snappy.
// This is fire-and-forget: the foreground install path in htmlToPng()
// handles the case where the user runs `share` before the pre-warm
// finishes.
const argv = process.argv.slice(2)
const isMetaCommand = argv.length === 0 ||
  argv[0] === "-h" || argv[0] === "--help" ||
  argv[0] === "-v" || argv[0] === "--version" ||
  argv[0] === "version"
if (!isMetaCommand) {
  // One-line hint so the user knows something is happening in the background.
  // We only print it if stderr is a TTY to avoid polluting CI output.
  if (process.stderr.isTTY && !process.env.CI) {
    process.stderr.write(
      chalk.gray(
        "▸ Pre-warming banner renderer (one-time, ~170 MB, runs in background)…\n"
      )
    )
  }
  prewarmChrome()
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
// Lazy-load share command to avoid @inquirer/prompts (needs Node 20+) on every invocation
if (process.argv.includes("share")) {
  const { makeShareCommand } = await import("./commands/share.ts")
  program.addCommand(makeShareCommand())
}
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
  const CMD = "npx --yes cachecatch"
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
  const msg = "\n" + chalk.bgRed.whiteBright.bold(" FATAL ") + " " +
    chalk.redBright(err instanceof Error ? err.message : String(err)) + "\n"
  process.stderr.write(msg)
  process.stdout.write(msg)
  if (err instanceof Error && err.stack && process.env.DEBUG) {
    process.stderr.write(chalk.gray(err.stack) + "\n")
  }
  process.exit(1)
})
// Note: no process.exit(0) here. The detached pre-warm child is
// unref()'d and the rest of the pre-warm path is synchronous, so the
// Node event loop drains naturally and the shell returns
// immediately. Calling process.exit(0) inside the parseAsync .then
// was truncating stdout on CI (process.exit doesn't flush stdout).

/**
 * Common CLI helpers — argument coercion, output, error handling.
 */

import { mkdirSync, writeFileSync, readdirSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { Command } from "commander"
import chalk from "chalk"
import type { CachecatchReport } from "../types/index.ts"
import { renderHtmlReport } from "../reporting/html-report.ts"
import {
  renderTerminalReport,
  renderTerminalReportSections,
  type TerminalReportOptions,
} from "../reporting/terminal-report.ts"

export type ReportOutputFormat = "json" | "html"

export function configureColor(enabled: boolean): void {
  chalk.level = enabled ? chalk.level : 0
}

export function coerceWindow(value: string): "24h" | "7d" | "30d" | "1y" {
  const v = value.trim().toLowerCase()
  if (v === "24h" || v === "7d" || v === "30d" || v === "1y") return v
  if (v === "24") return "24h"
  if (v === "7") return "7d"
  if (v === "30") return "30d"
  if (v === "365" || v === "1y" || v === "year") return "1y"
  throw new Error(`Invalid window "${value}". Use 24h, 7d, 30d, or 1y.`)
}

export function coerceLimit(value: string): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 1 || n > 10000) {
    throw new Error(`Invalid limit "${value}". Must be 1-10000.`)
  }
  return n
}

export function coerceReportFormat(value: string): ReportOutputFormat {
  const format = value.trim().toLowerCase()
  if (format === "json" || format === "html") return format
  throw new Error(`Invalid format "${value}". Use html or json.`)
}

export function coerceExportFormat(value: string): ReportOutputFormat | "terminal" {
  const format = value.trim().toLowerCase()
  if (format === "json" || format === "html" || format === "terminal") return format
  throw new Error(`Invalid format "${value}". Use html, json, or terminal.`)
}

export function writeReportToFile(
  report: CachecatchReport,
  outPath: string,
  format: ReportOutputFormat
): string {
  const abs = resolve(outPath)
  try {
    mkdirSync(dirname(abs), { recursive: true })
    if (format === "json") {
      writeFileSync(abs, JSON.stringify(report, null, 2), "utf-8")
    } else {
      writeFileSync(abs, renderHtmlReport(report), "utf-8")
    }
  } catch (e) {
    throw new Error(
      `Could not write ${format.toUpperCase()} report to ${abs}: ${
        e instanceof Error ? e.message : String(e)
      }`
    )
  }
  return abs
}

/**
 * Auto-save JSON report to a timestamped file in the reports directory.
 * Returns the path of the saved file.
 */
export function autoSaveJsonReport(report: CachecatchReport): string {
  const reportsDir = resolve(process.cwd(), "reports")
  mkdirSync(reportsDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const safeProject = report.projectName.replace(/[^a-z0-9_-]/gi, "_")
  const filename = `cachecatch-${safeProject}-${timestamp}.json`
  const outPath = resolve(reportsDir, filename)

  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8")
  return outPath
}

/**
 * Find the most recent auto-saved JSON report in the reports directory.
 * Returns the absolute path or null if none found.
 */
export function findLatestJsonReport(): string | null {
  const reportsDir = resolve(process.cwd(), "reports")
  try {
    const files = readdirSync(reportsDir)
    const jsonFiles = files
      .filter((f: string) => f.startsWith("cachecatch-") && f.endsWith(".json"))
      .map((f: string) => ({
        path: resolve(reportsDir, f),
        mtime: statSync(resolve(reportsDir, f)).mtimeMs,
      }))
      .sort((a: { mtime: number }, b: { mtime: number }) => b.mtime - a.mtime)

    return jsonFiles.length > 0 ? jsonFiles[0].path : null
  } catch {
    return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

export async function writeTerminalReport(
  report: CachecatchReport,
  options: TerminalReportOptions = {},
  stream = true
): Promise<void> {
  const canStream =
    stream &&
    process.stdout.isTTY &&
    !process.env.CI &&
    process.env.CACHECATCH_INSTANT !== "1"

  if (!canStream) {
    process.stdout.write("\n" + renderTerminalReport(report, options) + "\n")
    return
  }

  const sections = renderTerminalReportSections(report, options)
  const divider = "─".repeat(Math.max(72, Math.min(120, process.stdout.columns || 100)))

  process.stdout.write("\n")
  for (let i = 0; i < sections.length; i++) {
    if (i > 0) {
      process.stdout.write(`\n\n${chalk.gray(divider)}\n\n`)
    }
    process.stdout.write(sections[i])
    process.stdout.write("\n")
    if (i < sections.length - 1) {
      await sleep(i < 5 ? 260 : 180)
    }
  }
}

export function printHeader(): void {
  // Keep this minimal so it doesn't double up with the per-command header
  // printed by renderTerminalReport.
}

export function fail(message: string, err?: unknown): never {
  process.stderr.write("\n")
  process.stderr.write(chalk.bgRed.whiteBright.bold(" ERROR ") + " ")
  process.stderr.write(chalk.redBright(message) + "\n")
  if (err instanceof Error && err.stack && process.env.DEBUG) {
    process.stderr.write(chalk.gray(err.stack) + "\n")
  }
  process.exit(1)
}

export function withErrorHandling<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((err) => {
    fail(err instanceof Error ? err.message : String(err), err)
  })
}

export function pickApiKey(provided: string | undefined, envNames: string[]): string {
  if (provided && provided.length > 0) return provided
  for (const name of envNames) {
    const v = process.env[name]
    if (v && v.length > 0) return v
  }
  return ""
}

/**
 * Wait for an active TTY/keystroke — useful when running interactively.
 * Disabled in CI / non-TTY environments.
 */
export function maybeWaitForEnter(prompt = "Press Enter to continue…"): Promise<void> {
  if (!process.stdin.isTTY) return Promise.resolve()
  return new Promise((resolveFn) => {
    process.stdout.write("\n" + prompt)
    process.stdin.setEncoding("utf-8")
    process.stdin.once("data", () => resolveFn())
    process.stdin.resume()
  })
}

export function getCommandName(cmd: Command): string {
  return cmd.name()
}

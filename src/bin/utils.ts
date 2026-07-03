/**
 * Common CLI helpers — argument coercion, output, error handling.
 */

import { mkdirSync, writeFileSync, readdirSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import chalk from "chalk"
import type { CachecatchReport, LocalAgentReport } from "../types/index.ts"
import { renderHtmlReport } from "../reporting/html-report.ts"
import {
  renderTerminalReport,
  renderTerminalReportSections,
  type TerminalReportOptions,
} from "../reporting/terminal-report.ts"

export type ReportOutputFormat = "json" | "html"

export function configureColor(enabled: boolean): void {
  chalk.level = enabled && !process.env.NO_COLOR && !process.argv.includes("--no-color") ? 2 : 0
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

export function writeLocalAgentReportToFile(
  report: LocalAgentReport,
  outPath: string
): string {
  const abs = resolve(outPath)
  try {
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, JSON.stringify(report, null, 2), "utf-8")
  } catch (e) {
    throw new Error(
      `Could not write JSON report to ${abs}: ${
        e instanceof Error ? e.message : String(e)
      }`
    )
  }
  return abs
}

export function autoSaveLocalAgentReport(report: LocalAgentReport): string {
  const reportsDir = resolve(process.cwd(), "reports")
  mkdirSync(reportsDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const filename = `cachecatch-local-agent-context-audit-${timestamp}.json`
  const outPath = resolve(reportsDir, filename)

  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8")
  return outPath
}

/**
 * Find the most recent auto-saved JSON report in the reports directory.
 * Returns the absolute path or null if none found.
 */
export function findLatestJsonReport(preferLocal = false): string | null {
  const reportsDir = resolve(process.cwd(), "reports")
  try {
    const files = readdirSync(reportsDir)
    const jsonFiles = files
      .filter((f: string) => f.startsWith("cachecatch-") && f.endsWith(".json"))
      .map((f: string) => ({
        path: resolve(reportsDir, f),
        mtime: statSync(resolve(reportsDir, f)).mtimeMs,
        isLocal: f.includes("local-agent-context-audit"),
      }))
      .sort((a: { mtime: number }, b: { mtime: number }) => b.mtime - a.mtime)

    if (jsonFiles.length === 0) return null

    if (preferLocal) {
      const local = jsonFiles.find((f) => f.isLocal)
      if (local) return local.path
    }

    return jsonFiles[0].path
  } catch {
    return null
  }
}

/**
 * Stream text word-by-word (ChatGPT-style typing effect).
 * Preserves ANSI escape sequences and whitespace.
 */
export async function streamWordByWord(text: string, delayMs: number): Promise<void> {
  const tokens = text.split(/(\s+)/)
  for (const token of tokens) {
    process.stdout.write(token)
    if (token.trim().length > 0) {
      await sleep(delayMs)
    }
  }
}

export function sleep(ms: number): Promise<void> {
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

  for (let i = 0; i < sections.length; i++) {
    if (i > 0) {
      await streamWordByWord(`\n\n${chalk.gray(divider)}\n\n`, 12)
    }

    await streamWordByWord(sections[i], 20)
    process.stdout.write("\n")
  }
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


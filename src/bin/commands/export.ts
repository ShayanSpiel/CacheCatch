/**
 * `cachecatch export` — convert a previously-saved JSON report into
 * HTML or re-render the terminal view. Also accepts a previously
 * fetched report ID from sessionStorage (web app) when running in
 * a browser context (not used by the CLI directly, but the schema
 * is identical).
 */

import { Command } from "commander"
import chalk from "chalk"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { renderTerminalReport, renderCompactSummary } from "../../reporting/index.ts"
import { coerceExportFormat, configureColor, fail, withErrorHandling } from "../utils.ts"
import type { CachecatchReport } from "../../types/index.ts"

interface ExportFlags {
  format: "html" | "json" | "terminal"
  out?: string
  compact?: boolean
  color?: boolean
}

function writeTextFile(outPath: string, content: string, label: string): string {
  const abs = resolve(outPath)
  try {
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content, "utf-8")
  } catch (e) {
    throw new Error(
      `Could not write ${label} to ${abs}: ${
        e instanceof Error ? e.message : String(e)
      }`
    )
  }
  return abs
}

export function makeExportCommand(): Command {
  const cmd = new Command("export")
    .description(
      "Render a previously-saved CachecatchReport JSON to HTML, JSON, or the terminal."
    )
    .argument("[input]", "Path to a report.json file")
    .option("-f, --format <fmt>", "Output format: html | json | terminal", "html")
    .option("-o, --out <path>", "Output file path (default: stdout)")
    .option("--compact", "Compact terminal view")
    .option("--no-color", "Disable terminal colors")
    .action(async (input: string | undefined, flags: ExportFlags) => {
      await withErrorHandling(async () => {
        configureColor(flags.color !== false)
        if (!input) {
          fail(
            "No report JSON provided. Export converts a saved CachecatchReport JSON file. First run `npx --yes cachecatch sample --json > audit.json`, then `npx --yes cachecatch export audit.json --format html --out ./cachecatch-report.html`."
          )
        }
        const format = coerceExportFormat(flags.format)
        const absPath = resolve(input)
        let report: CachecatchReport
        try {
          const text = readFileSync(absPath, "utf-8")
          report = JSON.parse(text) as CachecatchReport
        } catch (e) {
          fail(
            `Failed to read report at ${absPath}: ${
              e instanceof Error ? e.message : String(e)
            }`
          )
        }

        if (!report || !report.id || !Array.isArray(report.routes)) {
          fail("Input does not look like a CachecatchReport JSON.")
        }

        if (format === "html") {
          const { renderHtmlReport } = await import(
            "../../reporting/html-report.ts"
          )
          const html = renderHtmlReport(report)
          if (flags.out) {
            const out = writeTextFile(flags.out, html, "HTML report")
            process.stdout.write(
              chalk.greenBright(`✔ HTML written to ${out}\n`)
            )
          } else {
            process.stdout.write(html + "\n")
          }
        } else if (format === "json") {
          const json = JSON.stringify(report, null, 2)
          if (flags.out) {
            const out = writeTextFile(flags.out, json, "JSON report")
            process.stdout.write(
              chalk.greenBright(`✔ JSON written to ${out}\n`)
            )
          } else {
            process.stdout.write(json + "\n")
          }
        } else {
          const out = flags.compact
            ? renderCompactSummary(report)
            : renderTerminalReport(report)
          if (flags.out) {
            const outPath = writeTextFile(flags.out, out, "terminal report")
            process.stdout.write(
              chalk.greenBright(`✔ Terminal view written to ${outPath}\n`)
            )
          } else {
            process.stdout.write("\n" + out + "\n")
          }
        }
      })
    })

  return cmd
}

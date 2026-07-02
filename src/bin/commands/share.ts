/**
 * `cachecatch share` — generate a shareable X card PNG from a report.
 *
 * Interactive flow:
 *   1. Load a report (from file or sample data)
 *   2. Prompt for X handle
 *   3. Fetch profile picture from unavatar.io
 *   4. Ask for verified badge
 *   5. Generate HTML card → PNG
 *   6. Print file path + suggested tweet
 */

import { Command } from "commander"
import chalk from "chalk"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { input, confirm } from "@inquirer/prompts"
import { sampleReport } from "../../../lib/cachecatch/sample-data.ts"
import { renderXCardHtml } from "../../reporting/x-card.ts"
import { htmlToPng } from "../../reporting/html-to-png.ts"
import { formatUsd } from "../../reporting/format.ts"
import { configureColor, fail, withErrorHandling, findLatestJsonReport } from "../utils.ts"
import type { CachecatchReport } from "../../types/index.ts"

interface ShareFlags {
  handle?: string
  out?: string
  color?: boolean
}

function extractHandle(raw: string): string {
  const trimmed = raw.trim()
  // Full URL: https://x.com/handle or https://twitter.com/handle
  const urlMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/([A-Za-z0-9_]+)\/?/
  )
  if (urlMatch) return `@${urlMatch[1]}`
  // Already has @
  if (trimmed.startsWith("@")) return trimmed
  // Bare handle
  return `@${trimmed}`
}

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY)
}

function buildTweetText(_report: CachecatchReport, _handle: string): string {
  return [
    "Prompt caching is the new prompt engineering.",
    "",
    "Ran a CacheCatch audit on our agent traces.",
    "",
    "It catches reusable prompt context missing cache",
    "because dynamic fields were loaded too early.",
    "",
    "Stable context first.",
    "Request-specific data later.",
    "",
    "Try yours:",
    "cachecatch.spielos.xyz",
  ].join("\n")
}

function buildTweetUrl(tweetText: string): string {
  return `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}`
}

export function makeShareCommand(): Command {
  const cmd = new Command("share")
    .description(
      "Generate a shareable X card PNG from a CacheCatch report."
    )
    .argument("[input]", "Path to a CachecatchReport JSON file (uses sample data if omitted)")
    .option("--handle <handle>", "X handle (e.g. @ShayanSpiel) — skips interactive prompt")
    .option("-o, --out <path>", "Output PNG path", "./cachecatch-x-share.png")
    .option("--no-color", "Disable terminal colors")
    .action(async (inputPath: string | undefined, flags: ShareFlags) => {
      await withErrorHandling(async () => {
        configureColor(flags.color !== false)

        // ---- Load report ------------------------------------------------
        let report: CachecatchReport
        if (inputPath) {
          const abs = resolve(inputPath)
          try {
            const text = readFileSync(abs, "utf-8")
            report = JSON.parse(text) as CachecatchReport
          } catch (e) {
            fail(
              `Failed to read report at ${abs}: ${
                e instanceof Error ? e.message : String(e)
              }`
            )
          }
          if (!report || !report.id || !Array.isArray(report.routes)) {
            fail("Input does not look like a CachecatchReport JSON.")
          }
        } else {
          // Try to find the latest auto-saved report
          const latestReportPath = findLatestJsonReport()
          if (latestReportPath) {
            try {
              const text = readFileSync(latestReportPath, "utf-8")
              report = JSON.parse(text) as CachecatchReport
              process.stdout.write(
                chalk.gray(`\n✓ Using latest report: ${latestReportPath}\n`)
              )
            } catch {
              report = sampleReport
              process.stdout.write(
                chalk.yellow("\n⚠ Could not load latest report, using sample data.\n")
              )
            }
          } else {
            report = sampleReport
            process.stdout.write(
              chalk.gray("\n✓ No saved reports found, using sample data.\n")
            )
          }
        }

        // ---- X handle ---------------------------------------------------
        let handle: string
        if (flags.handle) {
          handle = extractHandle(flags.handle)
        } else if (isInteractive()) {
          const raw = await input({
            message: "What's your X handle?",
            validate: (v: string) =>
              v && v.trim().length > 0 ? true : "Handle is required.",
          })
          handle = extractHandle(raw)
        } else {
          fail(
            "Missing X handle. Pass --handle @yourname when running non-interactively."
          )
        }

        const handleClean = handle.replace("@", "")

        // ---- Verified badge ---------------------------------------------
        let verified = false
        if (isInteractive()) {
          verified = await confirm({
            message: "Do you have an X Verified badge?",
            default: false,
          })
        }

        // ---- Fetch avatar URL -------------------------------------------
        const avatarUrl = `https://unavatar.io/x/${handleClean}`

        // ---- Generate HTML ----------------------------------------------
        const html = renderXCardHtml(report, {
          handle,
          avatarUrl,
          verified,
        })

        // ---- Convert to PNG ---------------------------------------------
        const outPath = flags.out ?? "./cachecatch-x-share.png"
        const savedPath = await htmlToPng(html, outPath)

        // ---- Print result -----------------------------------------------
        process.stdout.write(
          chalk.greenBright(`\n\u2714 Card saved to ${savedPath}\n`)
        )

        // ---- Suggested tweet --------------------------------------------
        const tweetText = buildTweetText(report, handle)
        const tweetUrl = buildTweetUrl(tweetText)

        process.stdout.write("\n")
        process.stdout.write(
          chalk.whiteBright.bold("Suggested post:\n")
        )
        process.stdout.write(chalk.gray("─".repeat(56)) + "\n")
        for (const line of tweetText.split("\n")) {
          process.stdout.write(`  ${chalk.whiteBright(line)}\n`)
        }
        process.stdout.write(chalk.gray("─".repeat(56)) + "\n")
        process.stdout.write(
          `\n  ${chalk.cyan("Open X to post:")} ${chalk.underline.cyan(tweetUrl)}\n\n`
        )
      })
    })

  return cmd
}

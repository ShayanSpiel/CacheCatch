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
import {
  renderIdeAgentXCardHtml,
  localAgentReportToIdeCardData,
} from "../../reporting/x-card-local.ts"
import { htmlToPng } from "../../reporting/html-to-png.ts"
import { configureColor, fail, withErrorHandling, findLatestJsonReport } from "../utils.ts"
import type { CachecatchReport, LocalAgentReport } from "../../types/index.ts"

interface ShareFlags {
  handle?: string
  out?: string
  color?: boolean
  verified?: boolean
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

function buildTweetText(): string {
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

function formatLocalTweetText(report: LocalAgentReport): string {
  const sessions = Math.round(report.summary.sessionsAnalyzed).toLocaleString("en-US")
  const tokens = report.summary.totalTokens >= 1_000_000_000
    ? `${(report.summary.totalTokens / 1_000_000_000).toFixed(2).replace(/\.00$/, "")}B`
    : report.summary.totalTokens.toLocaleString("en-US")
  const tools = Math.round(report.summary.toolCalls).toLocaleString("en-US")
  const subagents = Math.round(report.summary.subagentRuns).toLocaleString("en-US")
  const cacheRead = report.summary.cacheReadPercent === null
    ? "not reported"
    : `${Math.round(report.summary.cacheReadPercent * 100)}%`
  return [
    "Ran Cachecatch on my local AI build workflow.",
    "",
    `${sessions} agentic sessions`,
    `${tokens} token activity`,
    `${tools} tool calls`,
    `${subagents} subagent runs`,
    `${cacheRead} observed cache-read profile`,
    "",
    "Prompt CacheOps for local agents.",
    "Try yours: cachecatch.spielos.xyz",
  ].join("\n")
}

export function makeShareCommand(): Command {
  const cmd = new Command("share")
    .description(
      "Generate a shareable X card PNG from a CacheCatch report."
    )
    .argument("[input]", "Path to a CachecatchReport JSON file (uses sample data if omitted)")
    .option("--handle <handle>", "X handle (e.g. @ShayanSpiel) — skips interactive prompt")
    .option("-o, --out <path>", "Output PNG path", "./cachecatch-x-share.png")
    .option("--verified", "Show X Verified badge on the card")
    .option("--no-color", "Disable terminal colors")
    .action(async (inputPath: string | undefined, flags: ShareFlags) => {
      await withErrorHandling(async () => {
        configureColor(flags.color !== false)

        // ---- Load report ------------------------------------------------
        let report: CachecatchReport | LocalAgentReport
        let isLocal = false
        if (inputPath) {
          const abs = resolve(inputPath)
          try {
            const text = readFileSync(abs, "utf-8")
            const parsed = JSON.parse(text)
            isLocal = parsed?.reportType === "local-agent-context-audit"
            if (isLocal) {
              report = parsed as LocalAgentReport
            } else {
              report = parsed as CachecatchReport
              if (!report.id || !Array.isArray((report as CachecatchReport).routes)) {
                fail("Input does not look like a CachecatchReport JSON.")
              }
            }
          } catch (e) {
            fail(
              `Failed to read report at ${abs}: ${
                e instanceof Error ? e.message : String(e)
              }`
            )
          }
        } else {
          // Try to find the latest auto-saved report
          const latestReportPath = findLatestJsonReport(true)
          if (latestReportPath) {
            try {
              const text = readFileSync(latestReportPath, "utf-8")
              const parsed = JSON.parse(text)
              isLocal = parsed?.reportType === "local-agent-context-audit"
              report = parsed
              process.stdout.write(
                chalk.gray(`\n✓ Using latest report: ${latestReportPath}\n`)
              )
            } catch {
              report = sampleReport
              isLocal = false
              process.stdout.write(
                chalk.yellow("\n⚠ Could not load latest report, using sample data.\n")
              )
            }
          } else {
            report = sampleReport
            isLocal = false
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
        let verified = flags.verified ?? false
        if (!verified && isInteractive()) {
          verified = await confirm({
            message: "Do you have an X Verified badge?",
            default: false,
          })
        }

        // ---- Fetch avatar URL -------------------------------------------
        const avatarUrl = `https://unavatar.io/x/${handleClean}`

        // ---- Generate HTML ----------------------------------------------
        const html = isLocal
          ? renderIdeAgentXCardHtml(
              localAgentReportToIdeCardData(report as LocalAgentReport, {
                handle,
                avatarUrl,
                verified,
              })
            )
          : renderXCardHtml(report as CachecatchReport, {
              handle,
              avatarUrl,
              verified,
            })

        // ---- Convert to PNG ---------------------------------------------
        const outPath = flags.out ?? "./cachecatch-x-share.png"
        const savedPath = await htmlToPng(html, outPath)

        // ---- Print result -----------------------------------------------
        // ---- Suggested tweet --------------------------------------------
        const tweetText = isLocal
          ? formatLocalTweetText(report as LocalAgentReport)
          : buildTweetText()
        const tweetUrl = buildTweetUrl(tweetText)

        process.stdout.write(chalk.greenBright(`\n✔ Generated share banner\n`))
        process.stdout.write(`${chalk.gray("Banner PNG:")} ${chalk.whiteBright(savedPath)}\n`)
        process.stdout.write(chalk.gray("Use this file as the image attachment on X.\n"))

        process.stdout.write(`\n${chalk.whiteBright.bold("Suggested X copy")}\n`)
        process.stdout.write(chalk.gray("─".repeat(64)) + "\n")
        for (const line of tweetText.split("\n")) {
          process.stdout.write(`  ${chalk.whiteBright(line)}\n`)
        }
        process.stdout.write(chalk.gray("─".repeat(64)) + "\n")

        process.stdout.write(`\n${chalk.whiteBright.bold("Post it")}\n`)
        process.stdout.write(`${chalk.cyanBright("1.")} Open prefilled X post: ${chalk.underline.cyan(tweetUrl)}\n`)
        process.stdout.write(`${chalk.cyanBright("2.")} Attach the banner PNG above.\n`)
        process.stdout.write(`${chalk.cyanBright("3.")} Review, post, and ship it.\n\n`)
      })
    })

  return cmd
}

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
import { readFileSync, existsSync } from "node:fs"
import { resolve, dirname, isAbsolute, normalize } from "node:path"
import { execFileSync } from "node:child_process"
import { input, confirm } from "@inquirer/prompts"
import { sampleReport } from "../../../lib/cachecatch/sample-data.ts"
import { renderXCardHtml } from "../../reporting/x-card.ts"
import {
  renderIdeAgentXCardHtml,
  localAgentReportToIdeCardData,
} from "../../reporting/x-card-local.ts"
import { htmlToPng } from "../../reporting/html-to-png.ts"
import { configureColor, fail, withErrorHandling, findLatestJsonReport, fileLink, urlLink } from "../utils.ts"
import type { CachecatchReport, LocalAgentReport } from "../../types/index.ts"

interface ShareFlags {
  handle?: string
  out?: string
  color?: boolean
  verified?: boolean
  open?: boolean
  reveal?: boolean
}

/**
 * Pick the most reasonable OS-specific command to open `filePath` in the
 * default viewer. Returns a command + args tuple, or null if the host does
 * not have a usable opener (e.g. headless Linux without xdg-open).
 */
export function openCommandForPlatform(filePath: string): { cmd: string; args: string[] } | null {
  if (!filePath) return null
  if (process.platform === "darwin") return { cmd: "open", args: [filePath] }
  if (process.platform === "win32") {
    // cmd /c start "" "<path>" — the empty quoted string is the window title
    // and prevents cmd from treating a path with spaces as a title.
    return { cmd: "cmd", args: ["/c", "start", "", filePath] }
  }
  return { cmd: "xdg-open", args: [filePath] }
}

/**
 * Pick the most reasonable OS-specific command to reveal `filePath` in a
 * file manager. On Linux there is no portable "select file" command, so
 * we fall back to opening the parent directory. Returns null only when
 * no usable command exists.
 */
export function revealCommandForPlatform(filePath: string): { cmd: string; args: string[]; note?: string } | null {
  if (!filePath) return null
  if (process.platform === "darwin") return { cmd: "open", args: ["-R", filePath] }
  if (process.platform === "win32") {
    // explorer.exe /select,"<path>" — note the lack of space after the comma,
    // which is the documented Windows convention. spawn() handles the
    // quoting automatically because the comma+path is a single argv entry.
    return { cmd: "explorer", args: [`/select,${filePath}`] }
  }
  return { cmd: "xdg-open", args: [dirname(filePath)], note: "Linux has no portable 'select file' command; opened the parent directory." }
}

function safeSpawn(cmd: string, args: string[]): boolean {
  if (!cmd) return false
  try {
    // cmd is a platform-specific constant (open/xdg-open/cmd/explorer),
    // not user-controlled input.
    execFileSync(cmd, args, { stdio: "ignore", windowsHide: true }) // lgtm[js/shell-command-injection]
    return true
  } catch {
    return false
  }
}

function isSafePath(filePath: string): boolean {
  if (!filePath || filePath.length > 1024) return false
  const forbidden = ["|", ";", "&", "$", "`", "\n", "\r"]
  if (forbidden.some((ch) => filePath.includes(ch))) return false
  const abs = isAbsolute(filePath) ? filePath : resolve(filePath)
  const normalized = process.platform === "win32" ? normalize(abs) : abs
  return normalized === abs
}

function normalizeForOs(filePath: string): string {
  const abs = isAbsolute(filePath) ? filePath : resolve(filePath)
  return process.platform === "win32" ? normalize(abs) : abs
}

/**
 * Open a file in the OS default viewer. Best-effort: never throws, returns
 * silently if the opener isn't on PATH (CI, headless servers, etc).
 */
export function openInOS(filePath: string): boolean {
  if (!isSafePath(filePath)) return false
  const target = normalizeForOs(filePath)
  const spec = openCommandForPlatform(target)
  if (!spec) return false
  return safeSpawn(spec.cmd, spec.args)
}

/**
 * Reveal a file in the OS file manager (Finder / Explorer / xdg).
 * Returns true if a spawn was issued, false if no opener is available.
 * Linux fall-back opens the parent directory; callers can introspect this
 * via revealCommandForPlatform().note.
 */
export function revealInOS(filePath: string): boolean {
  if (!isSafePath(filePath)) return false
  const target = normalizeForOs(filePath)
  const spec = revealCommandForPlatform(target)
  if (!spec) return false
  return safeSpawn(spec.cmd, spec.args)
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

function buildTweetText(report?: CachecatchReport): string {
  if (report) {
    const sessions = Math.round(report.summary.runsAnalyzed).toLocaleString("en-US")
    const tokens = report.summary.observedInputTokens >= 1_000_000_000
      ? `${(report.summary.observedInputTokens / 1_000_000_000).toFixed(2).replace(/\.00$/, "")}B`
      : report.summary.observedInputTokens.toLocaleString("en-US")
    const routes = Math.round(report.summary.routesAnalyzed).toLocaleString("en-US")
    const findings = Math.round(report.findings.length).toLocaleString("en-US")
    return [
      "My AI agents apparently had a whole life behind my back.",
      "",
      `${sessions} sessions`,
      `${tokens} token activity`,
      `${routes} routes analyzed`,
      `${findings} findings`,
      "",
      "Cache profile + cost gap found by CacheCatch.",
      "",
      "Try yours:",
      "cachecatch.spielos.xyz",
    ].join("\n")
  }
  return [
    "My AI agents apparently had a whole life behind my back.",
    "",
    "Cache profile + cost gap found by CacheCatch.",
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
  return [
    "My AI agents apparently had a whole life behind my back.",
    "",
    `${sessions} sessions`,
    `${tokens} token activity`,
    `${tools} tool calls`,
    `${subagents} subagent runs`,
    "",
    "Cache profile + cost gap found by CacheCatch.",
    "",
    "Try yours:",
    "cachecatch.spielos.xyz",
  ].join("\n")
}

function nextNumberedPath(baseName: string, ext: string): string {
  let n = 1
  while (existsSync(`./${baseName}${n}.${ext}`)) n++
  return `./${baseName}${n}.${ext}`
}

export function makeShareCommand(): Command {
  const cmd = new Command("share")
    .description(
      "Generate a shareable X card PNG from a CacheCatch report."
    )
    .argument("[input]", "Path to a CachecatchReport JSON file (uses sample data if omitted)")
    .option("--handle <handle>", "X handle (e.g. @ShayanSpiel) — skips interactive prompt")
    .option("-o, --out <path>", "Output PNG path (auto-numbered if omitted)")
    .option("--verified", "Show X Verified badge on the card")
    .option("--open", "Open the generated PNG in the OS default viewer (Preview, Photos, etc)")
    .option("--reveal", "Reveal the generated PNG in the OS file manager (Finder, Explorer)")
    .option("--no-color", "Disable terminal colors")
    .action(async (inputPath: string | undefined, flags: ShareFlags) => {
      await withErrorHandling(async () => {
        configureColor(flags.color !== false)

        // ---- Load report ------------------------------------------------
        let report: CachecatchReport | LocalAgentReport
        let isLocal = false
        let sourcePath: string | null = null
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
            sourcePath = abs
          } catch (e) {
            fail(
              `Failed to read report at ${abs}: ${
                e instanceof Error ? e.message : String(e)
              }`
            )
          }
        } else {
          // Try to find the latest auto-saved report (any kind — let type detection pick the renderer)
          const latestReportPath = findLatestJsonReport(false)
          if (latestReportPath) {
            try {
              const text = readFileSync(latestReportPath, "utf-8")
              const parsed = JSON.parse(text)
              isLocal = parsed?.reportType === "local-agent-context-audit"
              report = parsed
              sourcePath = latestReportPath
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

        // ---- Fetch avatar with retry + timeout ----------------------------
        const avatarBaseUrl = `https://unavatar.io/x/${handleClean}`
        let avatarUrl = avatarBaseUrl
        const maxRetries = 3
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          process.stderr.write(
            chalk.cyan(
              attempt === 1
                ? `Fetching avatar for @${handleClean}...\n`
                : `Retrying avatar fetch (attempt ${attempt}/${maxRetries})...\n`
            )
          )
          try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 8000)
            const resp = await fetch(avatarBaseUrl, {
              signal: controller.signal,
              redirect: "follow",
            })
            clearTimeout(timeout)
            if (resp.ok) {
              const contentType = resp.headers.get("content-type") || ""
              if (contentType.includes("image/")) {
                const buf = Buffer.from(await resp.arrayBuffer())
                const mime = contentType.split(";")[0].trim()
                avatarUrl = `data:${mime};base64,${buf.toString("base64")}`
                process.stderr.write(chalk.green(`✔ Avatar fetched successfully\n`))
                break
              }
            }
            process.stderr.write(
              chalk.yellow(`⚠ Avatar returned non-image response (attempt ${attempt}/${maxRetries})\n`)
            )
          } catch {
            process.stderr.write(
              chalk.yellow(`⚠ Avatar fetch timed out (attempt ${attempt}/${maxRetries})\n`)
            )
          }
          if (attempt === maxRetries) {
            process.stderr.write(
              chalk.yellow("⚠ Could not fetch avatar, using fallback\n")
            )
          }
        }

        // ---- Generate HTML + PNG -----------------------------------------
        process.stderr.write(chalk.cyan("Generating banner...\n"))
        const outPath = flags.out ?? nextNumberedPath("cachecatch-x-share", "png")
        let savedPath: string
        try {
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
          savedPath = await htmlToPng(html, outPath)
        } catch {
          fail("Failed to generate banner")
        }

        // ---- Open / reveal the PNG in the OS shell ---------------------
        if (flags.open) {
          openInOS(savedPath)
          process.stderr.write(chalk.gray("  ▸ Opened in your default image viewer.\n"))
        } else if (flags.reveal) {
          revealInOS(savedPath)
          process.stderr.write(chalk.gray("  ▸ Revealed in your file manager.\n"))
        }

        // ---- Print result -----------------------------------------------
        // ---- Suggested tweet --------------------------------------------
        const tweetText = isLocal
          ? formatLocalTweetText(report as LocalAgentReport)
          : buildTweetText(report as CachecatchReport)
        const tweetUrl = buildTweetUrl(tweetText)

        process.stdout.write(chalk.whiteBright.bold(`\n✔︎ Your banner is generated\n\n`))
        process.stdout.write(
          `${chalk.whiteBright.bold("▶ PNG Banner")} ${chalk.gray("[⌘ + Click to open]")}: ${fileLink(savedPath)}\n`
        )
        if (flags.open || flags.reveal) {
          process.stdout.write(
            chalk.gray(
              `  Tip: pass --open or --reveal next time to auto-open in your viewer / Finder.`
            ) + "\n"
          )
        }
        if (sourcePath) {
          process.stdout.write(
            chalk.gray(`  Generated from: ${chalk.cyan(sourcePath)}\n`)
          )
        } else {
          process.stdout.write(
            chalk.gray(`  Generated from: ${chalk.cyan("sample data (no saved report found)")}\n`)
          )
        }
        process.stdout.write(chalk.gray("Use this file as the image attachment on X.\n"))

        process.stdout.write(`\n${chalk.whiteBright.bold("Suggested X copy")}\n`)
        process.stdout.write(chalk.gray("─".repeat(64)) + "\n")
        for (const line of tweetText.split("\n")) {
          process.stdout.write(`  ${chalk.whiteBright(line)}\n`)
        }
        process.stdout.write(chalk.gray("─".repeat(64)) + "\n")

        process.stdout.write(`\n${chalk.whiteBright.bold("Post it")}\n`)
        process.stdout.write(`${chalk.cyanBright("1.")} Open prefilled X post: ${urlLink(tweetUrl, "open X with the tweet pre-filled")}\n`)
        process.stdout.write(`${chalk.cyanBright("2.")} Attach the banner PNG above.\n`)
        process.stdout.write(`${chalk.cyanBright("3.")} Review, post, and ship it.\n\n`)
      })
    })

  return cmd
}

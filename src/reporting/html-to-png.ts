import { resolve, join, dirname } from "node:path"
import { existsSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import chalk from "chalk"

export interface HtmlToPngOptions {
  width?: number
  height?: number
  /** Progress callback (downloadedBytes, totalBytes) — used to drive an ora spinner. */
  onProgress?: (downloadedBytes: number, totalBytes: number) => void
}

interface LaunchOptions {
  headless: boolean
  executablePath?: string
  timeout?: number
}

function getSystemChromePath(): string | undefined {
  const paths = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ]
  for (const p of paths) {
    if (existsSync(p)) return p
  }
  return undefined
}

export function getPuppeteerCacheDir(): string {
  return join(homedir(), ".cache", "puppeteer")
}

interface InstalledBrowserInfo {
  executablePath: string
}

/**
 * Find an already-downloaded Chrome in the puppeteer cache. Returns null if
 * nothing is installed (which is the case on a fresh machine).
 */
async function findInstalledChrome(
  cacheDir: string
): Promise<InstalledBrowserInfo | null> {
  try {
    const browsers = await import("@puppeteer/browsers")
    const installed = await browsers.getInstalledBrowsers({ cacheDir })
    const chrome = installed.find((b: { browser: string }) => b.browser === "chrome")
    if (!chrome) return null
    return { executablePath: chrome.executablePath }
  } catch {
    return null
  }
}

/**
 * Download Chrome for Testing into the puppeteer cache. This is the same
 * binary puppeteer's full package downloads as a postinstall — moved out of
 * the npm install critical path so a broken cache can't kill `npx cachecatch`.
 *
 * Returns the path to the downloaded executable. Throws on network failure.
 */
async function downloadChrome(
  cacheDir: string,
  onProgress?: (downloadedBytes: number, totalBytes: number) => void
): Promise<InstalledBrowserInfo> {
  const browsers = await import("@puppeteer/browsers")
  const platform = browsers.detectBrowserPlatform()
  if (!platform) {
    throw new Error(
      `Cannot download Chrome for ${process.platform}/${process.arch}.`
    )
  }
  const buildId = await browsers.resolveBuildId(
    browsers.Browser.CHROME,
    platform,
    browsers.ChromeReleaseChannel.STABLE
  )
  const installed = await browsers.install({
    browser: browsers.Browser.CHROME,
    buildId,
    cacheDir,
    platform,
    downloadProgressCallback: onProgress ?? "default",
  })
  return { executablePath: installed.executablePath }
}

/**
 * Synchronous check for "is Chrome already installed in the puppeteer cache?"
 * Used by the pre-warm hot path so we can decide synchronously whether to
 * spawn the detached child before `process.exit(0)` kills the event loop.
 */
function isChromeInstalledSync(cacheDir: string): boolean {
  const chromeDir = join(cacheDir, "chrome")
  if (!existsSync(chromeDir)) return false
  try {
    const platformDirs = readdirSync(chromeDir)
    for (const platformDir of platformDirs) {
      const buildPath = join(chromeDir, platformDir)
      try {
        const builds = readdirSync(buildPath)
        if (builds.length > 0) {
          // Confirm the executable is actually there
          const executable = join(buildPath, "Google Chrome for Testing")
          if (existsSync(executable)) return true
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return false
}

/**
 * Pre-warm the puppeteer cache with Chrome. Safe to call from every command
 * entry point. Runs the download in a detached child process so the parent
 * CLI exits immediately, then the child continues downloading in the
 * background. Subsequent `cachecatch` invocations detect the cache and
 * skip the download.
 *
 * Synchronous on purpose: this is called right before the CLI's
 * `process.exit(0)`, so the spawn has to land before the event loop dies.
 */
export function prewarmChrome(): void {
  const cacheDir = getPuppeteerCacheDir()
  if (isChromeInstalledSync(cacheDir)) return
  spawnPrewarmChild(cacheDir)
}

/**
 * Spawn a detached Node child that runs the same download logic as the
 * foreground path. The child inherits the parent's `node_modules` by
 * inheriting `cwd` (the package root) plus `NODE_PATH`, so the same
 * `@puppeteer/browsers` install is resolved.
 */
function spawnPrewarmChild(cacheDir: string): void {
  try {
    // Find the package root (where node_modules/ lives). The compiled
    // html-to-png.js lives at dist/src/reporting/html-to-png.js — three
    // levels up from there. Source-mode (tsx) and the packaged dist
    // both use the same import.meta.url resolution.
    const here = dirname(fileURLToPath(import.meta.url))
    const pkgRoot = resolve(here, "..", "..", "..")

    // Inline script: do exactly what the foreground install does, but
    // silently. No spinner, no log — the user already saw the
    // "Pre-warming…" hint from the parent.
    const script = `
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import('@puppeteer/browsers').then(async (b) => {
  const cacheDir = ${JSON.stringify(cacheDir)}
  await mkdir(cacheDir, { recursive: true })
  const installed = await b.getInstalledBrowsers({ cacheDir })
  if (installed.find((x) => x.browser === 'chrome')) return
  const platform = b.detectBrowserPlatform()
  if (!platform) return
  const buildId = await b.resolveBuildId(b.Browser.CHROME, platform, b.ChromeReleaseChannel.STABLE)
  await b.install({
    browser: b.Browser.CHROME,
    buildId,
    cacheDir,
    platform,
    downloadProgressCallback: 'default',
  })
}).catch(() => { /* swallow — foreground will retry */ })
`

    const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
      cwd: pkgRoot,
      detached: true,
      stdio: "ignore",
      env: { ...process.env, CACHECATCH_PREWARM: "1" },
    })
    child.unref()
  } catch {
    // If we can't spawn the child for any reason, fall back to the
    // fire-and-forget in-process download (which will keep the parent
    // alive but at least gives the user Chrome).
    void (async () => {
      try {
        if (await findInstalledChrome(cacheDir)) return
        await downloadChrome(cacheDir)
      } catch {
        // ignore
      }
    })()
  }
}

export async function htmlToPng(
  html: string,
  outputPath: string,
  options: HtmlToPngOptions = {}
): Promise<string> {
  const width = options.width ?? 1024
  const height = options.height ?? 732

  // 1. Prefer an existing system Chrome / Chromium (zero install cost).
  let chromePath = getSystemChromePath()

  // 2. Otherwise check the puppeteer cache (already-downloaded by pre-warm
  //    or a previous `share` run).
  if (!chromePath) {
    const cacheDir = getPuppeteerCacheDir()
    const installed = await findInstalledChrome(cacheDir)
    if (installed) chromePath = installed.executablePath
  }

  // 3. Last resort: download Chrome now and show progress.
  if (!chromePath) {
    process.stderr.write(
      chalk.cyan(
        "First-time setup: downloading Chrome for banner rendering (~170 MB, one-time)…\n"
      )
    )
    try {
      const installed = await downloadChrome(getPuppeteerCacheDir(), options.onProgress)
      chromePath = installed.executablePath
      process.stderr.write(chalk.green("✔︎ Chrome ready\n"))
    } catch (e) {
      throw new Error(
        "Could not download Chrome for banner rendering.\n" +
          "  → " +
          (e instanceof Error ? e.message : String(e)) +
          "\n\n" +
          "Install Chrome manually instead:\n" +
          "  - Google Chrome:  https://www.google.com/chrome/\n" +
          "  - Chromium:       brew install --cask chromium\n" +
          "Then re-run `cachecatch share`."
      )
    }
  }

  type PuppeteerModule = typeof import("puppeteer-core")
  const puppeteerModule = (await import("puppeteer-core").catch(() => {
    throw new Error(
      "puppeteer-core is not installed. Run `npm install` in the Cachecatch package directory."
    )
  })) as unknown as { default: PuppeteerModule }
  const puppeteer: PuppeteerModule = puppeteerModule.default
  const launchOptions: LaunchOptions = { headless: true, executablePath: chromePath, timeout: 30000 }
  const browser = await puppeteer.launch(launchOptions)
  try {
    const page = await browser.newPage()
    await page.setViewport({ width, height })
    await page.setContent(html, { waitUntil: "load" })
    await page.evaluate(async () => {
      try { await document.fonts.ready } catch {}
      await new Promise((r) => setTimeout(r, 500))
    })
    const abs = resolve(outputPath)
    await page.screenshot({ path: abs, type: "png" })
    return abs
  } finally {
    await browser.close()
  }
}

import { resolve, join, dirname } from "node:path"
import { existsSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import chalk from "chalk"

const MICRO5_FONT_FAMILY = "CacheCatchMicro5"

/**
 * A minimal inlined Micro-5 fallback so banner rendering never depends on
 * Google Fonts. If the host has the real Micro 5 installed the @font-face
 * here resolves first; otherwise the system monospace stack takes over and
 * the banner still renders legibly.
 *
 * The font is exposed as an empty data URL — actual font binary bytes are
 * heavy and outside the runtime budget. Puppeteer's render does not actually
 * require the Micro 5 face to succeed; it only requires that font-family
 * resolution not hang on a remote CSS request, which is the failure mode we
 * are defending against here.
 */
const MICRO5_BASE64_FONT = ""

function micro5FontFaceCss(): string {
  if (!MICRO5_BASE64_FONT) return ""
  return `@font-face{font-family:"${MICRO5_FONT_FAMILY}";font-style:normal;font-weight:400;src:url(data:font/woff2;base64,${MICRO5_BASE64_FONT}) format("woff2");font-display:swap;}`
}

export function buildBannerStyleBootstrap(): string {
  return micro5FontFaceCss()
}

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
  const candidates: string[] = []
  if (process.platform === "win32") {
    const programFiles = process.env["ProgramFiles"] ?? "C:\\Program Files"
    const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)"
    const localAppData = process.env["LOCALAPPDATA"] ?? ""
    candidates.push(
      join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
      join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
      join(programFiles, "Chromium", "Application", "chrome.exe"),
      join(programFilesX86, "Chromium", "Application", "chrome.exe"),
    )
    if (localAppData) {
      candidates.push(
        join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
        join(localAppData, "Chromium", "Application", "chrome.exe"),
        join(localAppData, "ms-playwright", "chromium-1148", "chrome-win", "chrome.exe"),
        join(localAppData, "ms-playwright", "chromium-1187", "chrome-win", "chrome.exe"),
      )
    }
    candidates.push("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe")
  } else {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/snap/bin/chromium",
      "/opt/google/chrome/chrome",
    )
  }
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return undefined
}

export function getPuppeteerCacheDir(): string {
  if (process.platform === "win32") {
    const localAppData = process.env["LOCALAPPDATA"]
    if (localAppData) return join(localAppData, "cache", "puppeteer")
    return join(homedir(), "AppData", "Local", "cache", "puppeteer")
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Caches", "puppeteer")
  }
  return process.env["XDG_CACHE_HOME"] ?? join(homedir(), ".cache", "puppeteer")
}

function puppeteerChromeExecutableNames(): string[] {
  if (process.platform === "win32") {
    return ["chrome.exe"]
  }
  return ["Google Chrome for Testing", "chrome"]
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
 *
 * Walks the cache in a platform-aware way and matches the actual executable
 * names used by the @puppeteer/browsers installer on each OS.
 */
function isChromeInstalledSync(cacheDir: string): boolean {
  const chromeDir = join(cacheDir, "chrome")
  if (!existsSync(chromeDir)) return false
  const executables = puppeteerChromeExecutableNames()
  try {
    const platformDirs = readdirSync(chromeDir)
    for (const platformDir of platformDirs) {
      const buildPath = join(chromeDir, platformDir)
      let builds: string[]
      try {
        builds = readdirSync(buildPath)
      } catch {
        continue
      }
      for (const buildId of builds) {
        const buildDir = join(buildPath, buildId)
        for (const executable of executables) {
          if (existsSync(join(buildDir, executable))) return true
        }
      }
    }
  } catch {
    // ignore — fall through to false
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
    const safeHtml = inlineOfflineStyles(html)
    await page.setContent(safeHtml, { waitUntil: "domcontentloaded", timeout: 15000 })
    // Wait briefly for layout to settle, but do not block on remote font
    // fetches — the inline @font-face + system fallback covers us offline.
    await page.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 200))
    })
    const abs = resolve(outputPath)
    await page.screenshot({ path: abs, type: "png" })
    return abs
  } finally {
    await browser.close()
  }
}

/**
 * Replace any Google Fonts <link> tags in the HTML with an offline-safe
 * inline <style> block. Banner generation must work without network
 * access; an unreachable fonts.googleapis.com <link> would otherwise
 * stall the page-load wait or cause silent visual degradation.
 */
export function inlineOfflineStyles(html: string): string {
  const fontFace = buildBannerStyleBootstrap()
  const offlineBlock = fontFace
    ? `<style>${fontFace}</style>`
    : "<style>:root{--font-display:system-ui,sans-serif}</style>"
  return html
    .replace(/<link[^>]+fonts\.googleapis\.com[^>]*>\s*/gi, "")
    .replace(/<link[^>]+fonts\.gstatic\.com[^>]*>\s*/gi, "")
    .replace(/<head>/i, `<head>${offlineBlock}`)
}

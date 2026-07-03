import { resolve } from "node:path"
import { existsSync } from "node:fs"

export interface HtmlToPngOptions {
  width?: number
  height?: number
}

interface LaunchOptions {
  headless: boolean
  executablePath?: string
  timeout?: number
}

function getChromeExecutablePath(): string | undefined {
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

export async function htmlToPng(
  html: string,
  outputPath: string,
  options: HtmlToPngOptions = {}
): Promise<string> {
  const width = options.width ?? 1024
  const height = options.height ?? 732

  const chromePath = getChromeExecutablePath()

  const puppeteer = await import("puppeteer")
  const launchOptions: LaunchOptions = { headless: true }
  if (chromePath) {
    launchOptions.executablePath = chromePath
  }
  launchOptions.timeout = 30000
  const browser = await puppeteer.default.launch(launchOptions)
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
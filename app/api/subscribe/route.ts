import { NextRequest, NextResponse } from "next/server"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import os from "node:os"
import path from "node:path"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const FORM_ACTION = "https://docs.google.com/forms/d/e/1FAIpQLScSAISdLXFTAex_cHMmdMCXQdaMGlwLouLRmptFo_5VcdV_GA/formResponse"
const ENTRY_EMAIL = "entry.754901073"
const ENTRY_SOURCE = "entry.2021940811"
const REQUEST_TIMEOUT_MS = 7000
const RETRY_DELAYS_MS = [0, 350, 900]
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type CaptureEntry = {
  email: string
  emailHash: string
  source: string
  platform?: string
  page?: string
  userAgent?: string
  createdAt: string
}

function captureFilePath() {
  return process.env.EMAIL_CAPTURE_JSON_PATH || path.join(process.cwd(), "data", "email-captures.json")
}

async function readCaptureFile(filePath: string): Promise<CaptureEntry[]> {
  try {
    const raw = await readFile(filePath, "utf8")
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as CaptureEntry[]) : []
  } catch {
    return []
  }
}

async function appendCapture(entry: CaptureEntry) {
  const primaryPath = captureFilePath()
  const fallbackPath = path.join(os.tmpdir(), "cachecatch-email-captures.json")
  const targets = [primaryPath, fallbackPath]
  let lastError: unknown

  for (const filePath of targets) {
    try {
      await mkdir(path.dirname(filePath), { recursive: true })
      const existing = await readCaptureFile(filePath)
      const withoutDuplicate = existing.filter((item) => item.emailHash !== entry.emailHash)
      withoutDuplicate.push(entry)
      await writeFile(filePath, `${JSON.stringify(withoutDuplicate, null, 2)}\n`, "utf8")
      return { ok: true, path: filePath === primaryPath ? "data/email-captures.json" : "tmp" }
    } catch (err) {
      lastError = err
    }
  }

  throw lastError
}

function githubConfig() {
  const token = process.env.EMAIL_CAPTURE_GITHUB_TOKEN || process.env.GITHUB_TOKEN
  const owner = process.env.EMAIL_CAPTURE_GITHUB_OWNER
  const repo = process.env.EMAIL_CAPTURE_GITHUB_REPO
  const filePath = process.env.EMAIL_CAPTURE_GITHUB_PATH || "data/email-captures.json"
  const branch = process.env.EMAIL_CAPTURE_GITHUB_BRANCH

  if (!token || !owner || !repo) return null
  return { token, owner, repo, filePath, branch }
}

function encodeBase64(value: string) {
  return Buffer.from(value, "utf8").toString("base64")
}

function decodeBase64(value: string) {
  return Buffer.from(value, "base64").toString("utf8")
}

async function appendGithubCapture(entry: CaptureEntry) {
  const config = githubConfig()
  if (!config) return { ok: false, skipped: true, error: "GitHub email capture is not configured" }

  const url = new URL(
    `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.filePath}`
  )
  if (config.branch) url.searchParams.set("ref", config.branch)

  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${config.token}`,
    "Content-Type": "application/json",
    "User-Agent": "cachecatch-email-capture",
    "X-GitHub-Api-Version": "2022-11-28",
  }

  const getRes = await fetch(url, { headers, cache: "no-store" })
  let existing: CaptureEntry[] = []
  let sha: string | undefined

  if (getRes.ok) {
    const file = (await getRes.json()) as { content?: string; sha?: string }
    sha = file.sha
    if (file.content) {
      const parsed = JSON.parse(decodeBase64(file.content.replace(/\n/g, ""))) as unknown
      existing = Array.isArray(parsed) ? (parsed as CaptureEntry[]) : []
    }
  } else if (getRes.status !== 404) {
    return { ok: false, error: `GitHub read returned ${getRes.status}` }
  }

  const withoutDuplicate = existing.filter((item) => item.emailHash !== entry.emailHash)
  withoutDuplicate.push(entry)

  const putBody: Record<string, unknown> = {
    message: `Capture Cachecatch email: ${entry.emailHash.slice(0, 8)}`,
    content: encodeBase64(`${JSON.stringify(withoutDuplicate, null, 2)}\n`),
    sha,
  }
  if (config.branch) putBody.branch = config.branch
  if (!sha) delete putBody.sha

  const putRes = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify(putBody),
  })

  if (!putRes.ok) {
    const text = await putRes.text().catch(() => "")
    return { ok: false, error: `GitHub write returned ${putRes.status}${text ? `: ${text.slice(0, 200)}` : ""}` }
  }

  return { ok: true }
}

async function submitGoogleForm(email: string, source: string) {
  const formBody = new URLSearchParams()
  formBody.set(ENTRY_EMAIL, email)
  formBody.set("fvv", "1")
  formBody.set("partialResponse", '[null,null,"3995423505582472483"]')
  formBody.set("pageHistory", "0")
  formBody.set("fbzx", "3995423505582472483")
  formBody.set("submissionTimestamp", "-1")
  formBody.set(ENTRY_SOURCE, source)

  let lastError = "Google Form submission failed"

  for (const waitMs of RETRY_DELAYS_MS) {
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const res = await fetch(FORM_ACTION, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody.toString(),
        redirect: "manual",
        signal: controller.signal,
      })

      if (res.ok || res.status === 302 || res.status === 303) {
        return { ok: true, status: res.status }
      }

      const text = await res.text().catch(() => "")
      lastError = `Google Form returned ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Unknown error"
    } finally {
      clearTimeout(timeout)
    }
  }

  return { ok: false, error: lastError }
}

export async function POST(request: NextRequest) {
  let email: string
  let source = "Cachecatch CLI"
  let platform: string | undefined
  let page: string | undefined
  try {
    const body = await request.json()
    email = body.email
    if (typeof body.source === "string" && body.source.trim()) {
      source = body.source.trim()
    }
    if (typeof body.platform === "string" && body.platform.trim()) {
      platform = body.platform.trim()
    }
    if (typeof body.page === "string" && body.page.trim()) {
      page = body.page.trim()
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : ""

  if (!EMAIL_RE.test(normalizedEmail)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 })
  }

  const entry: CaptureEntry = {
    email: normalizedEmail,
    emailHash: createHash("sha256").update(normalizedEmail).digest("hex"),
    source,
    platform,
    page,
    userAgent: request.headers.get("user-agent") ?? undefined,
    createdAt: new Date().toISOString(),
  }

  const results: Array<{ backend: string; ok: boolean; skipped?: boolean; error?: string }> = []

  const settled = await Promise.allSettled([
    appendGithubCapture(entry),
    (async (): Promise<{ ok: boolean; path: string; error?: string }> => {
      try { const r = await appendCapture(entry); return { ...r, error: undefined } }
      catch (err) { return { ok: false, error: err instanceof Error ? err.message : "JSON capture failed", path: "data/email-captures.json" } }
    })(),
    submitGoogleForm(normalizedEmail, `${source}${platform ? ` / ${platform}` : ""}`),
  ])

  const ghVal = settled[0].status === "fulfilled" ? settled[0].value : { ok: false, error: "github rejected" }
  results.push({
    backend: "github-json",
    ok: ghVal.ok,
    skipped: "skipped" in ghVal ? ghVal.skipped : undefined,
    error: ghVal.ok ? undefined : ghVal.error,
  })

  const fileVal = settled[1].status === "fulfilled" ? settled[1].value : { ok: false, error: "file capture rejected", path: "data/email-captures.json" }
  results.push({
    backend: fileVal.path || "data/email-captures.json",
    ok: fileVal.ok,
    error: fileVal.ok ? undefined : fileVal.error,
  })

  const gfVal = settled[2].status === "fulfilled" ? settled[2].value as { ok: boolean; skipped?: boolean; error?: string } : { ok: false, error: "google form rejected" as string | undefined }
  results.push({
    backend: "google-form",
    ok: gfVal.ok,
    skipped: gfVal.skipped,
    error: gfVal.ok ? undefined : gfVal.error,
  })

  const successful = results.filter((result) => result.ok)
  if (successful.length > 0) {
    return NextResponse.json({
      ok: true,
      backend: successful.map((result) => result.backend).join("+"),
      skipped: results.filter((result) => result.skipped).map((result) => result.backend),
    })
  }

  return NextResponse.json({ error: results.map((result) => `${result.backend}: ${result.error}`).join("; ") }, { status: 502 })
}

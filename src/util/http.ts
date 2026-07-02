/**
 * Cross-cutting helpers for adapters and the CLI.
 * No imports from `src/engine/*` or `src/types/*` allowed here.
 */

import { existsSync, readFileSync } from "node:fs"

export interface RetryOptions {
  /** Total number of attempts (including the first). */
  retries: number
  /** Base delay for exponential backoff. */
  baseDelayMs: number
  /** Per-request timeout in milliseconds. */
  timeoutMs: number
  /** Maximum delay cap for exponential backoff. */
  maxDelayMs: number
  /** When true, log retry attempts to stderr (debug only). */
  verbose: boolean
}

export const DEFAULT_RETRY: RetryOptions = {
  retries: 4,
  baseDelayMs: 1000,
  timeoutMs: 30_000,
  maxDelayMs: 30_000,
  verbose: false,
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Compute the backoff delay for a given attempt (0-indexed).
 *
 * Formula: `min(baseDelay * 2^attempt, maxDelay) + random jitter`
 *
 * - Attempt 0 → baseDelay (1s)
 * - Attempt 1 → 2s
 * - Attempt 2 → 4s
 * - Attempt 3 → 8s
 * - …
 * The jitter (0–1000ms) prevents thundering-herd retries when many
 * processes hit the same rate limit at the same time.
 */
export function backoffMs(attempt: number, cfg: RetryOptions): number {
  const exp = Math.min(cfg.baseDelayMs * Math.pow(2, attempt), cfg.maxDelayMs)
  return exp + Math.floor(Math.random() * 1000)
}

/**
 * HTTP fetch with timeout, exponential backoff, and jitter.
 *
 * Honors:
 *   - 429 with `Retry-After` (seconds)
 *   - 5xx (server errors) → retry
 *   - Network errors / aborts → retry
 *   - 4xx (other client errors) → fail fast (no retry)
 */
export async function fetchWithRetry<T = unknown>(
  url: string,
  init: RequestInit,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const cfg: RetryOptions = { ...DEFAULT_RETRY, ...options }
  let lastError: Error | null = null

  for (let attempt = 0; attempt < cfg.retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)
    try {
      const headers = mergeHeaders(init.headers, init.body)
      const response = await fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (response.status === 429) {
        const headerVal = response.headers.get("retry-after")
        const retryAfter = headerVal
          ? Number(headerVal) * 1000
          : backoffMs(attempt, cfg)
        if (cfg.verbose) {
          process.stderr.write(
            `[cachecatch] 429 rate-limited, backing off ${Math.round(retryAfter)}ms (attempt ${attempt + 1}/${cfg.retries})\n`
          )
        }
        if (attempt < cfg.retries - 1) {
          await sleep(retryAfter)
          continue
        }
        throw new Error(`HTTP 429 — rate limited after ${cfg.retries} attempts`)
      }

      if (response.status >= 500 && response.status < 600) {
        if (attempt < cfg.retries - 1) {
          const wait = backoffMs(attempt, cfg)
          if (cfg.verbose) {
            process.stderr.write(
              `[cachecatch] ${response.status} server error, retrying in ${Math.round(wait)}ms\n`
            )
          }
          await sleep(wait)
          continue
        }
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "")
        throw new Error(
          `HTTP ${response.status} ${response.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`
        )
      }

      return (await response.json()) as T
    } catch (e) {
      clearTimeout(timer)
      lastError = e instanceof Error ? e : new Error(String(e))
      if (lastError.name === "AbortError") {
        if (cfg.verbose) {
          process.stderr.write(
            `[cachecatch] request timed out (attempt ${attempt + 1}/${cfg.retries})\n`
          )
        }
      }
      if (attempt < cfg.retries - 1) {
        await sleep(backoffMs(attempt, cfg))
      }
    }
  }

  throw lastError ?? new Error("Request failed after retries")
}

export function redactKey(apiKey: string): string {
  if (!apiKey) return ""
  if (apiKey.length <= 8) return "****"
  return apiKey.slice(0, 4) + "…" + apiKey.slice(-4)
}

/** Load .env from CWD without throwing if missing. */
export function loadDotenv(path = ".env"): void {
  if (!existsSync(path)) return
  try {
    const text = readFileSync(path, "utf-8")
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith("#")) continue
      const eq = line.indexOf("=")
      if (eq === -1) continue
      const key = line.slice(0, eq).trim()
      let value = line.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (!(key in process.env)) {
        process.env[key] = value
      }
    }
  } catch {
    // ignore
  }
}

export function pickFirst<T>(...values: Array<T | undefined | null | "" | false>): T | undefined {
  for (const v of values) if (v !== undefined && v !== null && v !== "" && v !== false) return v
  return undefined
}

export function pickString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === "string" && v.length > 0) return v
  }
  return undefined
}

export function asNumber(...values: unknown[]): number | undefined {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v
    if (typeof v === "string") {
      const n = Number(v)
      if (Number.isFinite(n)) return n
    }
  }
  return undefined
}

function mergeHeaders(
  headers: HeadersInit | undefined,
  body: BodyInit | null | undefined
): HeadersInit {
  const out: Record<string, string> = {}
  if (headers) {
    const h = new Headers(headers as HeadersInit)
    h.forEach((v, k) => {
      out[k] = v
    })
  }
  if (typeof body === "string" && !out["Content-Type"] && !out["content-type"]) {
    try {
      JSON.parse(body)
      out["Content-Type"] = "application/json"
    } catch {
      out["Content-Type"] = "text/plain;charset=UTF-8"
    }
  }
  return out
}

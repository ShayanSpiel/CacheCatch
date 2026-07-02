/**
 * Langfuse adapter.
 *
 * Translates Langfuse's Observations API v2 into `NormalizedTrace[]`
 * so the engine can analyze them.
 *
 * Auth: Basic auth using `LANGFUSE_PUBLIC_KEY` (username) and
 * `LANGFUSE_SECRET_KEY` (password). Both are read from env by the CLI
 * unless `--key` is passed as `publicKey:secretKey`.
 *
 * Reference:
 *   GET /api/public/v2/observations
 *   Basic auth: <publicKey>:<secretKey> (base64)
 */

import { fetchWithRetry, asNumber, pickString } from "../util/http.ts"
import type {
  AuditWindow,
  NormalizedTrace,
  ProviderAdapter,
  TraceMessage,
} from "../types/index.ts"
import { MAX_RUNS_FETCH } from "../engine/constants.ts"

export const LANGFUSE_BASE_URL = "https://cloud.langfuse.com"
export const LANGFUSE_SELF_HOSTED_DEFAULT = "http://localhost:3000"

const WINDOW_MS: Record<AuditWindow, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "1y": 365 * 24 * 60 * 60 * 1000,
}

export interface LangfuseCreds {
  publicKey: string
  secretKey: string
}

export function parseApiKey(raw: string): LangfuseCreds {
  if (raw.includes(":")) {
    const [publicKey, secretKey] = raw.split(":", 2)
    return { publicKey: publicKey?.trim() || "", secretKey: secretKey?.trim() || "" }
  }
  return { publicKey: raw, secretKey: process.env.LANGFUSE_SECRET_KEY || "" }
}

export function readCredsFromEnv(): LangfuseCreds {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY || ""
  const secretKey = process.env.LANGFUSE_SECRET_KEY || ""
  return { publicKey, secretKey }
}

export function basicAuthHeader(creds: LangfuseCreds): string {
  const token = Buffer.from(`${creds.publicKey}:${creds.secretKey}`).toString("base64")
  return `Basic ${token}`
}

interface LangfuseProject {
  id: string
  name: string
}

interface LangfuseObservation {
  id: string
  traceId: string
  startTime?: string
  endTime?: string
  type?: "GENERATION" | "SPAN" | "EVENT" | string
  name?: string
  providedModelName?: string
  modelParameters?: Record<string, unknown>
  input?: unknown
  output?: unknown
  metadata?: Record<string, unknown>
  usageDetails?: { input?: number; output?: number; total?: number }
  inputUsage?: number
  outputUsage?: number
  totalUsage?: number
  costDetails?: { input?: number; output?: number; total?: number }
  totalCost?: number
  inputCost?: number
  outputCost?: number
  userId?: string
  sessionId?: string
  version?: string
  environment?: string
  tags?: string[]
  traceName?: string
  promptName?: string
}

interface LangfuseListResponse {
  data: LangfuseObservation[]
  meta?: { cursor?: string | null }
}

function isGeneration(o: LangfuseObservation): boolean {
  return (o.type || "").toUpperCase() === "GENERATION"
}

function extractPromptText(input: unknown): string {
  if (!input) return ""
  if (typeof input === "string") return input
  if (typeof input === "object" && input !== null) {
    const obj = input as Record<string, unknown>
    if (typeof obj.prompt === "string") return obj.prompt
    if (typeof obj.input === "string") return obj.input
    if (typeof obj.text === "string") return obj.text
    if (Array.isArray(obj.messages)) {
      return (obj.messages as unknown[])
        .map((m) => {
          if (typeof m === "string") return m
          if (typeof m === "object" && m !== null) {
            const msg = m as Record<string, unknown>
            if (typeof msg.content === "string") return msg.content
            if (Array.isArray(msg.content)) {
              return (msg.content as unknown[])
                .map((p) => {
                  if (typeof p === "string") return p
                  if (typeof p === "object" && p !== null) {
                    const part = p as Record<string, unknown>
                    return typeof part.text === "string" ? part.text : ""
                  }
                  return ""
                })
                .filter(Boolean)
                .join("\n")
            }
          }
          return ""
        })
        .filter(Boolean)
        .join("\n")
    }
    try {
      return JSON.stringify(obj).slice(0, 4000)
    } catch {
      return ""
    }
  }
  return String(input)
}

function extractMessages(input: unknown): TraceMessage[] {
  if (!input || typeof input !== "object") return []
  const obj = input as Record<string, unknown>
  if (!Array.isArray(obj.messages)) return []
  const out: TraceMessage[] = []
  for (const m of obj.messages as unknown[]) {
    if (!m || typeof m !== "object") continue
    const msg = m as Record<string, unknown>
    const role = typeof msg.role === "string" ? msg.role : "user"
    if (typeof msg.content === "string") {
      out.push({ role: role as TraceMessage["role"], content: msg.content })
    } else if (Array.isArray(msg.content)) {
      const text = (msg.content as unknown[])
        .map((p) => {
          if (typeof p === "string") return p
          if (typeof p === "object" && p !== null) {
            const part = p as Record<string, unknown>
            return typeof part.text === "string" ? part.text : ""
          }
          return ""
        })
        .filter(Boolean)
        .join("\n")
      out.push({ role: role as TraceMessage["role"], content: text })
    }
  }
  return out
}

function extractRoute(obs: LangfuseObservation): string {
  if (obs.traceName && obs.name) return `${obs.traceName}.${obs.name}`
  if (obs.name) return obs.name
  if (obs.tags && obs.tags.length > 0) return obs.tags.join(".")
  return "unknown"
}

export function normalizeLangfuseObservation(obs: LangfuseObservation): NormalizedTrace {
  const promptText = extractPromptText(obs.input)
  const messages = extractMessages(obs.input)

  const inputTokens =
    asNumber(
      obs.usageDetails?.input,
      obs.usageDetails?.total,
      obs.inputUsage,
      obs.totalUsage
    ) || 0
  const outputTokens =
    asNumber(obs.usageDetails?.output, obs.outputUsage) || 0
  const cacheReadTokens =
    asNumber(
      (obs.usageDetails as Record<string, unknown> | undefined)?.cacheRead,
      (obs.usageDetails as Record<string, unknown> | undefined)?.cached,
      (obs.usageDetails as Record<string, unknown> | undefined)?.cached_input
    ) || 0
  const cacheCreationTokens =
    asNumber(
      (obs.usageDetails as Record<string, unknown> | undefined)?.cacheCreation,
      (obs.usageDetails as Record<string, unknown> | undefined)?.cache_creation_input
    ) || 0

  const cost =
    asNumber(obs.costDetails?.total, obs.totalCost, obs.inputCost) || 0

  return {
    traceId: obs.traceId || obs.id,
    provider: "langfuse",
    model: pickString(obs.providedModelName, "unknown") || "unknown",
    route: extractRoute(obs),
    promptText,
    messages: messages.length > 0 ? messages : [{ role: "user", content: promptText }],
    metrics: {
      totalInputTokens: inputTokens,
      totalOutputTokens: outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      costUsd: cost,
      estimatedWasteUsd: 0,
    },
    startedAt: obs.startTime,
    metadata: {
      ...(obs.metadata || {}),
      userId: obs.userId,
      sessionId: obs.sessionId,
      version: obs.version,
      environment: obs.environment,
      tags: obs.tags,
      promptName: obs.promptName,
    },
  }
}

export class LangfuseClient {
  constructor(
    private creds: LangfuseCreds,
    private baseUrl: string = LANGFUSE_BASE_URL
  ) {}

  private headers(): HeadersInit {
    return {
      Authorization: basicAuthHeader(this.creds),
      "Content-Type": "application/json",
      Accept: "application/json",
    }
  }

  private getUrl(path: string): string {
    return `${this.baseUrl.replace(/\/$/, "")}${path}`
  }

  /** Langfuse v3 list projects. Returns all projects the creds can see. */
  async listProjects(): Promise<LangfuseProject[]> {
    const data = await fetchWithRetry<{ data: LangfuseProject[] }>(
      this.getUrl("/api/public/projects"),
      { method: "GET", headers: this.headers() }
    )
    return (data.data || []).filter(
      (p) => typeof p?.id === "string" && typeof p?.name === "string"
    )
  }

  async getProjectId(nameOrId: string): Promise<string | null> {
    try {
      const projects = await this.listProjects()
      const found = projects.find(
        (p) => p.id === nameOrId || p.name === nameOrId
      )
      return found?.id || null
    } catch {
      return null
    }
  }

  /** List observations for a project within a time window. */
  async listObservations(args: {
    projectId: string
    fromStartTime: string
    toStartTime: string
    limit?: number
    type?: "GENERATION"
  }): Promise<LangfuseObservation[]> {
    const max = args.limit ?? MAX_RUNS_FETCH
    const out: LangfuseObservation[] = []
    let cursor: string | undefined = undefined

    while (out.length < max) {
      const params = new URLSearchParams()
      params.set("fromStartTime", args.fromStartTime)
      params.set("toStartTime", args.toStartTime)
      params.set("limit", String(Math.min(1000, max - out.length)))
      params.set(
        "fields",
        "core,basic,io,usage,model,metadata,trace_context"
      )
      if (args.type) params.set("type", args.type)
      if (cursor) params.set("cursor", cursor)

      const url = `${this.getUrl("/api/public/v2/observations")}?${params.toString()}`
      const res = await fetchWithRetry<LangfuseListResponse>(url, {
        method: "GET",
        headers: this.headers(),
      })
      const rows = res.data || []
      out.push(...rows)
      if (!res.meta?.cursor) break
      cursor = res.meta.cursor
      if (rows.length === 0) break
    }

    return out.slice(0, max)
  }
}

function getWindow(window: AuditWindow): { from: string; to: string } {
  const to = new Date()
  const from = new Date(to.getTime() - WINDOW_MS[window])
  return { from: from.toISOString(), to: to.toISOString() }
}

export const langfuseAdapter: ProviderAdapter = {
  id: "langfuse",
  displayName: "Langfuse",

  async resolveProject(ref: string) {
    const creds = readCredsFromEnv()
    if (!creds.publicKey || !creds.secretKey) {
      throw new Error(
        "LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are required. Pass --key publicKey:secretKey or export both."
      )
    }
    const baseUrl = process.env.LANGFUSE_BASE_URL || LANGFUSE_BASE_URL
    const client = new LangfuseClient(creds, baseUrl)
    const id = await client.getProjectId(ref)
    if (!id) throw new Error(`Langfuse project "${ref}" not found.`)
    return { id, name: ref }
  },

  async fetchTraces({ project, apiKey, window, limit, baseUrl }) {
    let creds: LangfuseCreds
    if (apiKey) {
      creds = parseApiKey(apiKey)
    } else {
      creds = readCredsFromEnv()
    }
    if (!creds.publicKey || !creds.secretKey) {
      throw new Error(
        "Missing Langfuse credentials. Pass --key publicKey:secretKey or set LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY."
      )
    }
    const url = baseUrl || process.env.LANGFUSE_BASE_URL || LANGFUSE_BASE_URL
    const client = new LangfuseClient(creds, url)
    const projectId = await client.getProjectId(project)
    if (!projectId) throw new Error(`Langfuse project "${project}" not found.`)
    const { from, to } = getWindow(window)
    const observations = await client.listObservations({
      projectId,
      fromStartTime: from,
      toStartTime: to,
      limit: limit ?? MAX_RUNS_FETCH,
      type: "GENERATION",
    })
    if (observations.length === 0) {
      throw new Error(`No GENERATION observations in "${project}" within ${window}.`)
    }
    // Normalize defensively — a single malformed observation should
    // not kill the whole audit.
    const traces: NormalizedTrace[] = []
    for (const obs of observations) {
      if (!isGeneration(obs)) continue
      try {
        traces.push(normalizeLangfuseObservation(obs))
      } catch (e) {
        if (process.env.DEBUG) {
          process.stderr.write(
            `[langfuse] failed to normalize observation: ${
              e instanceof Error ? e.message : String(e)
            }\n`
          )
        }
      }
    }
    if (traces.length === 0) {
      throw new Error(
        `Found ${observations.length} observations in "${project}" but none are GENERATION-type.`
      )
    }
    return { traces, projectName: project }
  },
}

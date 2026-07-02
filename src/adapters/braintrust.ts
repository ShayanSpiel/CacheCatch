/**
 * Braintrust adapter.
 *
 * Translates Braintrust's BTQL `/btql` API into `NormalizedTrace[]`.
 *
 * Auth: Bearer token (BRAINTRUST_API_KEY). Base URL defaults to
 * `https://api.braintrust.dev` (US region) or `api-eu.braintrust.dev`
 * (EU region) when `BRAINTRUST_BASE_URL` is set.
 *
 * Strategy: query `project_logs(<id>, shape => 'spans')` filtering
 * to LLM-type spans, then map each span to a NormalizedTrace.
 */

import { fetchWithRetry, asNumber, pickString } from "../util/http.ts"
import type {
  AuditWindow,
  NormalizedTrace,
  ProviderAdapter,
  TraceMessage,
} from "../types/index.ts"
import { MAX_RUNS_FETCH } from "../engine/constants.ts"

export const BRAINTRUST_BASE_URL = "https://api.braintrust.dev"
export const BRAINTRUST_EU_BASE_URL = "https://api-eu.braintrust.dev"

const WINDOW_MS: Record<AuditWindow, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "1y": 365 * 24 * 60 * 60 * 1000,
}

interface BraintrustProject {
  id: string
  name: string
}

interface BraintrustSpan {
  id: string
  root_span_id?: string
  span_id?: string
  span_attributes?: {
    name?: string
    type?: string
    [k: string]: unknown
  }
  input?: unknown
  output?: unknown
  metadata?: Record<string, unknown>
  metrics?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    prompt_cached_tokens?: number
    prompt_cache_creation_tokens?: number
    estimated_cost?: number
    start?: number
    end?: number
  }
  created?: string
  tags?: string[]
}

interface BtqlResponse {
  data?: BraintrustSpan[]
  cursor?: string
}

function isLlmSpan(span: BraintrustSpan): boolean {
  return (span.span_attributes?.type || "").toLowerCase() === "llm"
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

function extractRoute(span: BraintrustSpan): string {
  const meta = span.metadata as Record<string, unknown> | undefined
  if (meta && typeof meta.route === "string") return meta.route as string
  if (span.span_attributes?.name) return span.span_attributes.name
  if (span.tags && span.tags.length > 0) return span.tags.join(".")
  return "unknown"
}

export function normalizeBraintrustSpan(span: BraintrustSpan): NormalizedTrace {
  const promptText = extractPromptText(span.input)
  const messages = extractMessages(span.input)
  const metrics = span.metrics || {}
  const meta = span.metadata as Record<string, unknown> | undefined
  const model =
    pickString(
      meta?.model as string,
      (meta?.model as Record<string, unknown> | undefined)?.name as string,
      span.span_attributes?.model as string
    ) || "unknown"

  const inputTokens =
    asNumber(metrics.prompt_tokens, (metrics as Record<string, unknown>).input_tokens) || 0
  const outputTokens =
    asNumber(
      metrics.completion_tokens,
      (metrics as Record<string, unknown>).output_tokens
    ) || 0
  const cacheReadTokens =
    asNumber(
      metrics.prompt_cached_tokens,
      (metrics as Record<string, unknown>).cached_tokens,
      (metrics as Record<string, unknown>).cache_read_input_tokens
    ) || 0
  const cacheCreationTokens =
    asNumber(
      metrics.prompt_cache_creation_tokens,
      (metrics as Record<string, unknown>).cache_creation_input_tokens
    ) || 0
  const cost = asNumber(metrics.estimated_cost) || 0

  return {
    traceId: span.root_span_id || span.id,
    provider: "braintrust",
    model,
    route: extractRoute(span),
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
    startedAt: span.created,
    metadata: {
      ...(meta || {}),
      tags: span.tags,
      spanType: span.span_attributes?.type,
      spanName: span.span_attributes?.name,
    },
  }
}

export class BraintrustClient {
  constructor(
    private apiKey: string,
    private baseUrl: string = BRAINTRUST_BASE_URL
  ) {}

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    }
  }

  private getUrl(path: string): string {
    return `${this.baseUrl.replace(/\/$/, "")}${path}`
  }

  /** List all projects accessible to this API key. */
  async listProjects(): Promise<BraintrustProject[]> {
    const data = await fetchWithRetry<{ objects: BraintrustProject[] }>(
      this.getUrl("/v1/project"),
      { method: "GET", headers: this.headers() }
    )
    return (data.objects || []).filter(
      (p) => typeof p?.id === "string" && typeof p?.name === "string"
    )
  }

  async getProjectId(nameOrId: string): Promise<string | null> {
    const projects = await this.listProjects()
    const found = projects.find((p) => p.id === nameOrId || p.name === nameOrId)
    return found?.id || null
  }

  /** Run a BTQL query with cursor-based pagination. */
  async query(args: { query: string; cursor?: string; limit?: number }): Promise<BtqlResponse> {
    const body: Record<string, unknown> = {
      query: args.query,
      fmt: "json",
    }
    if (args.cursor) body.cursor = args.cursor
    return fetchWithRetry<BtqlResponse>(this.getUrl("/btql"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    })
  }

  async listLlmSpans(args: {
    projectId: string
    window: AuditWindow
    limit?: number
  }): Promise<BraintrustSpan[]> {
    const max = args.limit ?? MAX_RUNS_FETCH
    const intervalDays = Math.ceil(WINDOW_MS[args.window] / (24 * 60 * 60 * 1000))
    const query = `
      SELECT
        id,
        root_span_id,
        span_attributes,
        input,
        output,
        metadata,
        metrics,
        created,
        tags
      FROM project_logs('${args.projectId}', shape => 'spans')
      WHERE span_attributes.type = 'llm'
        AND created > now() - interval ${intervalDays} day
      ORDER BY created DESC
      LIMIT ${Math.min(1000, max)}
    `

    const out: BraintrustSpan[] = []
    let cursor: string | undefined = undefined
    let safety = 0
    while (out.length < max && safety < 50) {
      safety++
      const res = await this.query({ query, cursor, limit: max - out.length })
      const rows = res.data || []
      out.push(...rows)
      if (!res.cursor || rows.length === 0) break
      cursor = res.cursor
    }
    return out.slice(0, max)
  }
}

function readApiKey(): string {
  return process.env.BRAINTRUST_API_KEY || ""
}

export const braintrustAdapter: ProviderAdapter = {
  id: "braintrust",
  displayName: "Braintrust",

  async resolveProject(ref: string) {
    const key = readApiKey()
    if (!key) {
      throw new Error(
        "BRAINTRUST_API_KEY is required. Pass --key or export BRAINTRUST_API_KEY."
      )
    }
    const baseUrl = process.env.BRAINTRUST_BASE_URL || BRAINTRUST_BASE_URL
    const client = new BraintrustClient(key, baseUrl)
    const id = await client.getProjectId(ref)
    if (!id) throw new Error(`Braintrust project "${ref}" not found.`)
    return { id, name: ref }
  },

  async fetchTraces({ project, apiKey, window, limit, baseUrl }) {
    const key = apiKey || readApiKey()
    if (!key) {
      throw new Error(
        "Missing Braintrust API key. Pass --key or set BRAINTRUST_API_KEY."
      )
    }
    const url = baseUrl || process.env.BRAINTRUST_BASE_URL || BRAINTRUST_BASE_URL
    const client = new BraintrustClient(key, url)
    const projectId = await client.getProjectId(project)
    if (!projectId) throw new Error(`Braintrust project "${project}" not found.`)
    const spans = await client.listLlmSpans({
      projectId,
      window,
      limit: limit ?? MAX_RUNS_FETCH,
    })
    const llm = spans.filter(isLlmSpan)
    if (llm.length === 0) {
      throw new Error(
        `No LLM-type spans in Braintrust project "${project}" within ${window}.`
      )
    }
    // Normalize defensively.
    const traces: NormalizedTrace[] = []
    for (const span of llm) {
      try {
        traces.push(normalizeBraintrustSpan(span))
      } catch (e) {
        if (process.env.DEBUG) {
          process.stderr.write(
            `[braintrust] failed to normalize span: ${
              e instanceof Error ? e.message : String(e)
            }\n`
          )
        }
      }
    }
    return { traces, projectName: project }
  },
}

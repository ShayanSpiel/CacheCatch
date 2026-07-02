/**
 * LangSmith adapter.
 *
 * Translates LangSmith's `/sessions` and `/runs/query` payloads into
 * `NormalizedTrace[]` so the engine can analyze them.
 *
 * Auth: pass `apiKey` directly. Read from env via `LANGSMITH_API_KEY`
 * in the CLI.
 */

import { fetchWithRetry, asNumber, pickString } from "../util/http.ts"
import type {
  AuditWindow,
  NormalizedTrace,
  ProviderAdapter,
  TraceMessage,
} from "../types/index.ts"
import { MAX_RUNS_FETCH } from "../engine/constants.ts"

export const LANGSMITH_BASE_URL = "https://api.smith.langchain.com"

interface SessionSummary {
  id: string
  name: string
}

const WINDOW_MS: Record<AuditWindow, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "1y": 365 * 24 * 60 * 60 * 1000,
}

function getStartTime(window: AuditWindow): string {
  return new Date(Date.now() - WINDOW_MS[window]).toISOString()
}

function extractSessions(data: unknown): SessionSummary[] {
  const raw: unknown[] = Array.isArray(data)
    ? data
    : typeof data === "object" && data !== null && Array.isArray((data as { sessions?: unknown }).sessions)
      ? (data as { sessions: unknown[] }).sessions
      : []

  return raw.filter(
    (s): s is SessionSummary =>
      typeof s === "object" &&
      s !== null &&
      typeof (s as { id?: unknown }).id === "string" &&
      typeof (s as { name?: unknown }).name === "string"
  )
}

interface RawLangSmithRun {
  id: string
  name?: string
  run_type?: string
  inputs?: Record<string, unknown>
  outputs?: Record<string, unknown>
  extra?: Record<string, unknown>
  start_time?: string
  end_time?: string
  trace_id?: string
  metadata?: Record<string, unknown>
  total_tokens?: number
  prompt_tokens?: number
  completion_tokens?: number
  total_cost?: number
  prompt_cost?: number
  completion_cost?: number
  prompt_token_details?: Record<string, unknown>
  completion_token_details?: Record<string, unknown>
  usage_metadata?: Record<string, unknown>
}

function extractPromptText(inputs?: Record<string, unknown>): string {
  if (!inputs) return ""
  const val = inputs as Record<string, unknown>

  if (typeof val.prompt === "string") return val.prompt
  if (typeof val.messages === "string") return val.messages

  if (Array.isArray(val.messages)) {
    return val.messages
      .map((m: unknown) => {
        if (typeof m === "string") return m
        if (typeof m === "object" && m !== null) {
          const msg = m as Record<string, unknown>
          if (typeof msg.content === "string") return msg.content
          if (Array.isArray(msg.content)) {
            return (msg.content as unknown[])
              .map((part) => {
                if (typeof part === "string") return part
                if (typeof part === "object" && part !== null) {
                  const p = part as Record<string, unknown>
                  return typeof p.text === "string" ? p.text : JSON.stringify(part)
                }
                return JSON.stringify(part)
              })
              .join("\n")
          }
          return JSON.stringify(m)
        }
        return JSON.stringify(m)
      })
      .join("\n")
  }

  if (typeof val.query === "string") return val.query
  if (typeof val.question === "string") return val.question
  if (typeof val.text === "string") return val.text

  try {
    return JSON.stringify(val).slice(0, 2000)
  } catch {
    return ""
  }
}

function extractMessages(inputs?: Record<string, unknown>): TraceMessage[] {
  if (!inputs) return []
  const val = inputs as Record<string, unknown>
  if (!Array.isArray(val.messages)) return []
  const out: TraceMessage[] = []
  for (const m of val.messages as unknown[]) {
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

function extractModel(
  raw: RawLangSmithRun,
  extra?: Record<string, unknown>,
  metadata?: Record<string, unknown>
): string | undefined {
  const outputs = raw.outputs as Record<string, unknown> | undefined
  const respMeta = outputs?.response_metadata as Record<string, unknown> | undefined
  const extraMeta = extra?.metadata as Record<string, unknown> | undefined
  return pickString(
    metadata?.ls_model_name as string,
    extraMeta?.ls_model_name as string,
    extra?.model as string,
    (extra?.invocation_params as Record<string, unknown> | undefined)?.model as string,
    respMeta?.model_name as string,
    metadata?.model as string,
    metadata?.model_name as string
  )
}

function extractTokenMetrics(
  raw: RawLangSmithRun,
  outputs?: Record<string, unknown>,
  extra?: Record<string, unknown>
): {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
} {
  const llmOutput = outputs?.llm_output as Record<string, unknown> | undefined
  const tokenUsage = extra?.token_usage as Record<string, unknown> | undefined
  const metadata = (extra?.metadata || raw.metadata || extra) as
    | Record<string, unknown>
    | undefined
  const usageMeta = raw.usage_metadata as Record<string, unknown> | undefined
  const usageOutputs =
    (outputs?.usage_metadata as Record<string, unknown> | undefined) ||
    (extra?.usage_metadata as Record<string, unknown> | undefined) ||
    ((extra?.metadata as Record<string, unknown> | undefined)?.usage_metadata as
      | Record<string, unknown>
      | undefined)
  const usage = llmOutput?.token_usage as Record<string, unknown> | undefined
  const metadataUsage = metadata?.usage as Record<string, unknown> | undefined
  const rawUsage = (raw.outputs as Record<string, unknown> | undefined)?.usage as
    | Record<string, unknown>
    | undefined
  const extraUsage = (extra?.usage as Record<string, unknown>) ||
    (metadata?.usage as Record<string, unknown>)
  const inputTokenDetails = (usageMeta?.input_token_details as Record<string, unknown>) ||
    (usageOutputs?.input_token_details as Record<string, unknown>) ||
    (raw.prompt_token_details as Record<string, unknown>)

  const cacheRead = asNumber(
    (inputTokenDetails as Record<string, unknown>)?.cache_read,
    (inputTokenDetails as Record<string, unknown>)?.cache_read_input_tokens,
    (inputTokenDetails as Record<string, unknown>)?.cached_tokens,
    rawUsage &&
      (rawUsage as Record<string, unknown>).prompt_tokens_details &&
      ((rawUsage.prompt_tokens_details as Record<string, unknown>).cached_tokens as number),
    (extraUsage as Record<string, unknown> | undefined)?.prompt_tokens_details &&
      ((extraUsage.prompt_tokens_details as Record<string, unknown>).cached_tokens as number)
  )

  const cacheCreation = asNumber(
    (inputTokenDetails as Record<string, unknown>)?.cache_creation,
    (inputTokenDetails as Record<string, unknown>)?.cache_creation_input_tokens,
    (inputTokenDetails as Record<string, unknown>)?.ephemeral_5m_input_tokens,
    (inputTokenDetails as Record<string, unknown>)?.ephemeral_1h_input_tokens,
    (usageMeta as Record<string, unknown> | undefined)?.cache_creation_input_tokens,
    (usageOutputs as Record<string, unknown> | undefined)?.cache_creation_input_tokens
  )

  const inputTokens =
    asNumber(
      usageMeta?.input_tokens,
      usageOutputs?.input_tokens,
      usage?.prompt_tokens,
      usage?.input_tokens,
      tokenUsage?.prompt_tokens,
      tokenUsage?.input_tokens,
      metadataUsage?.input_tokens,
      raw.prompt_tokens
    ) || 0

  const outputTokens =
    asNumber(
      usageMeta?.output_tokens,
      usageOutputs?.output_tokens,
      usage?.completion_tokens,
      usage?.output_tokens,
      tokenUsage?.completion_tokens,
      tokenUsage?.output_tokens,
      metadataUsage?.output_tokens,
      raw.completion_tokens
    ) || 0

  const totalTokens =
    asNumber(
      usageMeta?.total_tokens,
      usageOutputs?.total_tokens,
      raw.total_tokens,
      usage?.total_tokens,
      tokenUsage?.total_tokens
    ) || 0

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cacheReadTokens: cacheRead ?? 0,
    cacheCreationTokens: cacheCreation ?? 0,
  }
}

function extractCostUsd(
  raw: RawLangSmithRun,
  extra?: Record<string, unknown>,
  metadata?: Record<string, unknown>
): number {
  return (
    asNumber(
      extra?.cost,
      metadata?.cost,
      metadata?.total_cost,
      raw.total_cost,
      raw.prompt_cost
    ) || 0
  )
}

export function normalizeLangSmithRun(raw: RawLangSmithRun): NormalizedTrace {
  const id = raw.id || ""
  const name = raw.name || "unnamed"
  const runType = raw.run_type || ""
  const inputs = raw.inputs
  const outputs = raw.outputs
  const extra = raw.extra
  const metadata = raw.metadata
  const promptText = extractPromptText(inputs)
  const messages = extractMessages(inputs)
  const model = extractModel(raw, extra, metadata)
  const m = extractTokenMetrics(raw, outputs, extra)
  const costUsd = extractCostUsd(raw, extra, metadata)

  const route = name.includes("/") ? name : `${runType || "llm"}.${name}`

  return {
    traceId: raw.trace_id || id,
    provider: "langsmith",
    model: model || "unknown",
    route,
    promptText,
    messages: messages.length > 0 ? messages : [{ role: "user", content: promptText }],
    metrics: {
      totalInputTokens: m.inputTokens,
      totalOutputTokens: m.outputTokens,
      cacheReadTokens: m.cacheReadTokens,
      cacheCreationTokens: m.cacheCreationTokens,
      costUsd,
      estimatedWasteUsd: 0,
    },
    startedAt: raw.start_time,
    metadata,
  }
}

function isLLMShape(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false
  const r = raw as Record<string, unknown>
  if (r.run_type === "llm") return true

  const extra = r.extra as Record<string, unknown> | undefined
  const lgMeta = extra?.metadata as Record<string, unknown> | undefined
  if (typeof lgMeta?.langgraph_node === "string" && lgMeta.langgraph_node.length > 0) {
    return true
  }

  const inputs = r.inputs as Record<string, unknown> | undefined
  if (Array.isArray(inputs?.messages) && inputs.messages.length > 0) return true
  if (typeof inputs?.prompt === "string" && inputs.prompt.length > 0) return true

  const inv = extra?.invocation_params as Record<string, unknown> | undefined
  if (typeof inv?.model === "string" && inv.model.length > 0) return true

  const outputs = r.outputs as Record<string, unknown> | undefined
  if (outputs?.llm_output || outputs?.generations) return true

  return false
}

export class LangSmithClient {
  constructor(
    private apiKey: string,
    private baseUrl: string = LANGSMITH_BASE_URL
  ) {}

  private getUrl(path: string): string {
    return `${this.baseUrl.replace(/\/$/, "")}/api/v1${path}`
  }

  async listProjects(): Promise<SessionSummary[]> {
    const out: SessionSummary[] = []
    const limit = 100
    let offset = 0
    while (true) {
      const url = `${this.getUrl("/sessions")}?limit=${limit}&offset=${offset}`
      const data = await fetchWithRetry<unknown>(url, {
        method: "GET",
        headers: { "X-Api-Key": this.apiKey },
      })
      const sessions = extractSessions(data)
      out.push(...sessions)
      if (sessions.length < limit) break
      offset += limit
    }
    return out
  }

  async getProjectId(nameOrId: string): Promise<string | null> {
    const filterUrl = `${this.getUrl("/sessions")}?name=${encodeURIComponent(nameOrId)}&limit=1`
    const data = await fetchWithRetry<unknown>(filterUrl, {
      method: "GET",
      headers: { "X-Api-Key": this.apiKey },
    })
    const direct = extractSessions(data).find(
      (s) => s.name === nameOrId || s.id === nameOrId
    )
    if (direct) return direct.id
    const projects = await this.listProjects()
    const project = projects.find(
      (p) => p.id === nameOrId || p.name === nameOrId
    )
    return project?.id || null
  }

  async listRuns(
    sessionId: string,
    options?: {
      limit?: number
      startTime?: string
      endTime?: string
      runType?: string
    }
  ): Promise<unknown[]> {
    const maxToFetch = options?.limit ?? 1000
    const pageSize = 100
    const runs: unknown[] = []
    let offset = 0

    while (runs.length < maxToFetch) {
      const body: Record<string, unknown> = {
        session: [sessionId],
        limit: pageSize,
        offset,
      }
      if (options?.startTime) body.start_time = options.startTime
      if (options?.endTime) body.end_time = options.endTime
      if (options?.runType) body.run_type = options.runType

      const data = await fetchWithRetry<{ runs: unknown[] }>(
        this.getUrl("/runs/query"),
        {
          method: "POST",
          headers: {
            "X-Api-Key": this.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      )
      const page = data.runs || []
      runs.push(...page)
      if (page.length < pageSize) break
      offset += pageSize
    }
    return runs.slice(0, maxToFetch)
  }
}

export const langSmithAdapter: ProviderAdapter = {
  id: "langsmith",
  displayName: "LangSmith",

  async resolveProject(ref: string) {
    const apiKey = process.env.LANGSMITH_API_KEY
    if (!apiKey) {
      throw new Error(
        "LANGSMITH_API_KEY is required. Run `npx cachecatch config set-key langsmith <key>` or export LANGSMITH_API_KEY."
      )
    }
    const client = new LangSmithClient(apiKey)
    const id = await client.getProjectId(ref)
    if (!id) {
      throw new Error(`Project "${ref}" not found. Check the name and ensure the API key has access.`)
    }
    return { id, name: ref, url: undefined }
  },

  async fetchTraces({ project, apiKey, window, limit, baseUrl }) {
    const key = apiKey || process.env.LANGSMITH_API_KEY
    if (!key) {
      throw new Error("Missing LangSmith API key. Pass --key or set LANGSMITH_API_KEY.")
    }
    const client = new LangSmithClient(key, baseUrl)
    const projectId = await client.getProjectId(project)
    if (!projectId) {
      throw new Error(`Project "${project}" not found.`)
    }
    const startTime = getStartTime(window)
    const raw = await client.listRuns(projectId, {
      limit: limit ?? MAX_RUNS_FETCH,
      startTime,
    })
    if (!raw || raw.length === 0) {
      throw new Error(`No runs found for project "${project}" in window ${window}.`)
    }
    const llmRuns = raw.filter(isLLMShape)
    if (llmRuns.length === 0) {
      throw new Error(
        `Found ${raw.length} run(s) in "${project}" but none are LLM-shaped.`
      )
    }
    // Normalize defensively: a single bad row should not kill the
    // entire audit. If anything goes wrong, fall back to an empty
    // trace so the run still appears in the report (with zero tokens).
    const traces: NormalizedTrace[] = []
    for (const r of llmRuns) {
      try {
        traces.push(normalizeLangSmithRun(r as RawLangSmithRun))
      } catch (e) {
        if (process.env.DEBUG) {
          process.stderr.write(
            `[langsmith] failed to normalize run: ${
              e instanceof Error ? e.message : String(e)
            }\n`
          )
        }
      }
    }
    if (traces.length === 0) {
      throw new Error(
        `Found ${llmRuns.length} LLM-shaped run(s) in "${project}" but none could be normalized.`
      )
    }
    return { traces, projectName: project }
  },
}

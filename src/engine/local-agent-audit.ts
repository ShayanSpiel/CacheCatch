import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { basename, extname, join, resolve } from "node:path"
import type {
  AuditWindow,
  Confidence,
  LocalAgentFinding,
  LocalAgentModelSummary,
  LocalAgentProvider,
  LocalAgentRecommendation,
  LocalAgentReport,
} from "../types/index.ts"
import { approximateTokens } from "./tokens.ts"

const PRICING_DISCLAIMER =
  "Estimates are based on local sessions, detected model names, token estimates when available, inferred reusable context, and built-in model pricing assumptions. Promotions, subscriptions, included usage, enterprise pricing, regional pricing, and provider cache behavior may vary."

const ZERO_PARSED_FINDING =
  "Cachecatch found local agent sessions but could not parse their current storage format."

type CandidateType = "jsonl" | "json" | "sqlite" | "unknown"
type ParseStatus = "parsed" | "failed" | "skipped"

interface LocalSession {
  agent: LocalAgentProvider
  path: string
  startedAt?: Date
  text: string
  models: string[]
  parseWarnings: string[]
  projectPath?: string
  subagent?: string
  toolCalls: number
  metrics: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    costUsd: number | null
    tokenAccounting: "observed" | "estimated"
  }
}

interface AgentRoot {
  agent: LocalAgentProvider
  path: string
}

interface CandidateDiagnostic {
  provider: LocalAgentProvider
  rootPath: string
  path: string
  sizeBytes?: number
  modifiedAt?: string
  modifiedMs?: number
  inWindow: boolean
  candidateType?: CandidateType
  parserTried?: string
  parseStatus: ParseStatus
  parseReason?: string
  topLevelKeys?: string[]
  eventTypes?: string[]
  discoveredSessions?: number
  sessionsInWindow?: number
}

interface ParseResult {
  status: ParseStatus
  reason?: string
  parserTried: string
  text: string
  models: string[]
  sessions?: LocalSession[]
  warnings: string[]
  topLevelKeys: string[]
  eventTypes: string[]
  discoveredSessions?: number
  sessionsInWindow?: number
  projects?: LocalAgentReport["projects"]
  activity?: LocalAgentReport["activity"]
  projectPath?: string
  subagent?: string
  toolCalls?: number
}

interface ModelPricing {
  normalizedName: string
  provider: string
  inputUsdPerMTok?: number
  pricingConfidence: Confidence
}

interface AgentSignals {
  sessionsAnalyzed: number
  dynamicEarly: number
  largeDynamicEarly: number
  repeatedContext: number
  longWithoutSummary: number
  unknownPricing: number
  malformed: number
  totalEstimatedInputTokens: number
  reusableEstimatedTokens: number
}

export interface LocalAuditOptions {
  window: AuditWindow
  project?: string
  redact?: boolean
  now?: Date
  debugSample?: number
}

const DYNAMIC_PATTERNS = [
  /\bdiff --git\b/i,
  /\b(?:error|warning|stack trace|traceback)\b/i,
  /\b(?:npm|pnpm|yarn|bun) (?:run|install|test|build)\b/i,
  /\b(?:stdout|stderr|terminal|command output)\b/i,
  /\bcommit [a-f0-9]{7,40}\b/i,
  /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
]

const STABLE_CONTEXT_PATTERNS = [
  /\bAGENTS\.md\b/,
  /\bCLAUDE\.md\b/,
  /\bRepository layout\b/i,
  /\bTech Stack\b/i,
  /\bKey rules\b/i,
  /\bsrc\/engine\b/,
]

const SUMMARY_PATTERNS = [/\bsummary\b/i, /\brecap\b/i, /\bcontext compact/i, /\bcompacted\b/i]

const MODEL_ALIASES: Array<[RegExp, ModelPricing]> = [
  [/claude(?:-| )?3\.?5(?:-| )?sonnet|claude(?:-| )?sonnet/i, { normalizedName: "claude-sonnet", provider: "anthropic", inputUsdPerMTok: 3, pricingConfidence: "medium" }],
  [/claude(?:-| )?opus/i, { normalizedName: "claude-opus", provider: "anthropic", inputUsdPerMTok: 15, pricingConfidence: "medium" }],
  [/claude(?:-| )?haiku/i, { normalizedName: "claude-haiku", provider: "anthropic", inputUsdPerMTok: 0.8, pricingConfidence: "medium" }],
  [/gpt-5|codex/i, { normalizedName: "gpt-codex-family", provider: "openai", inputUsdPerMTok: 1.25, pricingConfidence: "low" }],
  [/gpt-4\.?1|gpt-4o|o3|o4/i, { normalizedName: "gpt-family", provider: "openai", inputUsdPerMTok: 2.5, pricingConfidence: "low" }],
  [/gpt-4o-mini|gpt-4\.?1-mini|o4-mini/i, { normalizedName: "gpt-mini-family", provider: "openai", inputUsdPerMTok: 0.15, pricingConfidence: "low" }],
  [/gemini(?:-| )?2\.?5(?:-| )?pro|gemini(?:-| )?pro/i, { normalizedName: "gemini-pro", provider: "google", inputUsdPerMTok: 1.25, pricingConfidence: "low" }],
  [/gemini(?:-| )?flash/i, { normalizedName: "gemini-flash", provider: "google", inputUsdPerMTok: 0.3, pricingConfidence: "low" }],
  [/glm/i, { normalizedName: "glm-family", provider: "zhipu", pricingConfidence: "low" }],
  [/qwen/i, { normalizedName: "qwen-family", provider: "alibaba", pricingConfidence: "low" }],
  [/deepseek/i, { normalizedName: "deepseek-family", provider: "deepseek", pricingConfidence: "low" }],
  [/minimax/i, { normalizedName: "minimax-family", provider: "minimax", pricingConfidence: "low" }],
  [/kimi|moonshot/i, { normalizedName: "kimi-family", provider: "moonshot", pricingConfidence: "low" }],
  [/codestral|mistral/i, { normalizedName: "codestral-family", provider: "mistral", pricingConfidence: "low" }],
]

function windowStart(window: AuditWindow, now: Date): number {
  const days = window === "24h" ? 1 : window === "7d" ? 7 : window === "30d" ? 30 : 365
  return now.getTime() - days * 24 * 60 * 60 * 1000
}

function safeStat(path: string): ReturnType<typeof statSync> | null {
  try {
    return statSync(path)
  } catch {
    return null
  }
}

function listFiles(root: string, maxFiles = 5000): string[] {
  const out: string[] = []
  const stack = [root]
  while (stack.length > 0 && out.length < maxFiles) {
    const current = stack.pop()
    if (!current) continue
    let entries: string[]
    try {
      entries = readdirSync(current)
    } catch {
      continue
    }
    for (const entry of entries) {
      const path = join(current, entry)
      const stat = safeStat(path)
      if (!stat) continue
      if (stat.isDirectory()) {
        stack.push(path)
      } else if (stat.isFile() && isCandidateFile(path, Number(stat.size))) {
        out.push(path)
      }
    }
  }
  return out
}

function isCandidateFile(path: string, size: number): boolean {
  const name = basename(path).toLowerCase()
  if (name === "opencode.db") return true
  if (size > 25 * 1024 * 1024) return false
  return (
    name.endsWith(".jsonl") ||
    name.endsWith(".json") ||
    name.endsWith(".db") ||
    name.endsWith(".sqlite") ||
    name.endsWith(".sqlite3") ||
    name.endsWith(".txt") ||
    name.endsWith(".log") ||
    name.includes("session") ||
    name.includes("transcript") ||
    name.includes("message") ||
    name.includes("storage")
  )
}

function classifyCandidate(path: string): CandidateType {
  const ext = extname(path).toLowerCase()
  if (ext === ".jsonl") return "jsonl"
  if (ext === ".json") return "json"
  if (ext === ".db" || ext === ".sqlite" || ext === ".sqlite3") return "sqlite"
  return "unknown"
}

function detectRoots(): AgentRoot[] {
  const home = homedir()
  const roots: AgentRoot[] = [
    { agent: "claude-code", path: join(home, ".claude", "projects") },
    { agent: "codex", path: join(home, ".codex", "sessions") },
    { agent: "opencode", path: join(home, ".local", "share", "opencode") },
  ]
  const claudeConfig = process.env.CLAUDE_CONFIG_DIR
  if (claudeConfig) roots.push({ agent: "claude-code", path: join(claudeConfig, "projects") })
  return roots.filter((root, index, arr) => arr.findIndex((r) => r.agent === root.agent && r.path === root.path) === index)
}

function compactKeys(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return []
  return Object.keys(value as Record<string, unknown>).slice(0, 24)
}

function addSet(target: Set<string>, values: Array<string | undefined>): void {
  for (const value of values) {
    if (value && value.trim()) target.add(value.trim())
  }
}

function stringifyLeaf(value: unknown, depth = 0): string[] {
  if (depth > 8 || value === null || value === undefined) return []
  if (typeof value === "string") return [value]
  if (typeof value === "number" || typeof value === "boolean") return [String(value)]
  if (Array.isArray(value)) return value.flatMap((item) => stringifyLeaf(item, depth + 1))
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>
    const preferred = [
      "content",
      "text",
      "message",
      "prompt",
      "input",
      "output",
      "delta",
      "items",
      "summary",
      "arguments",
      "result",
      "error",
    ]
    return preferred.flatMap((key) => stringifyLeaf(obj[key], depth + 1))
  }
  return []
}

function collectModels(value: unknown, out: Set<string>, depth = 0): void {
  if (depth > 8 || value === null || value === undefined) return
  if (typeof value === "string") return
  if (Array.isArray(value)) {
    for (const item of value) collectModels(item, out, depth + 1)
    return
  }
  if (typeof value !== "object") return
  const obj = value as Record<string, unknown>
  for (const key of ["model", "modelName", "model_name", "model_slug"]) {
    if (typeof obj[key] === "string") out.add(obj[key] as string)
  }
  collectModels(obj.config, out, depth + 1)
  collectModels(obj.session, out, depth + 1)
  collectModels(obj.message, out, depth + 1)
  collectModels(obj.payload, out, depth + 1)
}

function parseJsonLineObjects(raw: string): { objects: unknown[]; malformed: number } {
  const objects: unknown[] = []
  let malformed = 0
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      objects.push(JSON.parse(trimmed))
    } catch {
      malformed++
    }
  }
  return { objects, malformed }
}

function parseJsonFile(raw: string): { objects: unknown[]; malformed: number } {
  const trimmed = raw.trim()
  if (!trimmed) return { objects: [], malformed: 0 }
  try {
    const parsed = JSON.parse(trimmed)
    return { objects: Array.isArray(parsed) ? parsed : [parsed], malformed: 0 }
  } catch {
    return parseJsonLineObjects(raw)
  }
}

function parserName(provider: LocalAgentProvider, type: CandidateType): string {
  if (provider === "claude-code" && type === "jsonl") return "claude-jsonl"
  if (provider === "codex" && type === "jsonl") return "codex-jsonl"
  if (provider === "codex" && type === "json") return "codex-json"
  if (provider === "opencode" && type === "sqlite") return "opencode-sqlite"
  if (provider === "opencode" && (type === "jsonl" || type === "json")) return `opencode-${type}`
  return `${provider}-${type}`
}

function parseCandidate(provider: LocalAgentProvider, type: CandidateType, raw: string, redact: boolean): ParseResult {
  const parserTried = parserName(provider, type)
  if (raw.length === 0) return failed(parserTried, "empty file")
  if (type === "sqlite") {
    return failed(
      parserTried,
      provider === "opencode"
        ? "OpenCode storage detected but parser for this storage format is not implemented yet."
        : "sqlite parser is not implemented"
    )
  }
  if (type !== "jsonl" && type !== "json") return failed(parserTried, "unsupported file type")

  const parsed = type === "jsonl" ? parseJsonLineObjects(raw) : parseJsonFile(raw)
  const textParts: string[] = []
  const models = new Set<string>()
  const eventTypes = new Set<string>()
  const topLevelKeys = new Set<string>()
  let projectPath: string | undefined
  let subagent: string | undefined
  let toolCalls = 0

  for (const obj of parsed.objects) {
    if (!obj || typeof obj !== "object") continue
    const record = obj as Record<string, unknown>
    const payload = record.payload && typeof record.payload === "object"
      ? (record.payload as Record<string, unknown>)
      : undefined
    for (const key of compactKeys(record)) topLevelKeys.add(key)
    const recordTypes = [
      asString(record.type),
      asString(record.event),
      asString(record.eventType),
      asString(record.kind),
      asString(payload?.type),
    ]
    addSet(eventTypes, recordTypes)
    if (recordTypes.some((value) => value && /^(function_call|custom_tool_call|mcp_tool_call|web_search_call|tool_search_call)$/i.test(value))) {
      toolCalls += 1
    }
    collectModels(record, models)

    if (provider === "claude-code") {
      textParts.push(...parseClaudeRecord(record))
    } else if (provider === "codex") {
      textParts.push(...parseCodexRecord(record))
      projectPath ??= asString(payload?.cwd)
      subagent ??= codexSubagentName(payload)
    } else {
      textParts.push(...parseOpenCodeRecord(record))
    }
  }

  const text = redactText(textParts.filter(Boolean).join("\n"), redact)
  if (!text.trim()) {
    return {
      status: "failed",
      parserTried,
      reason: parsed.malformed > 0 ? "malformed or unsupported json shape" : "unsupported json shape: no readable message content",
      text: "",
      models: Array.from(models),
      warnings: parsed.malformed > 0 ? [`${parsed.malformed} malformed JSON line(s) skipped.`] : [],
      topLevelKeys: Array.from(topLevelKeys).slice(0, 24),
      eventTypes: Array.from(eventTypes).slice(0, 24),
    }
  }

  return {
    status: "parsed",
    parserTried,
    reason: parsed.malformed > 0 ? `${parsed.malformed} malformed JSON line(s) skipped.` : undefined,
    text,
    models: Array.from(models),
    warnings: parsed.malformed > 0 ? [`${parsed.malformed} malformed JSON line(s) skipped.`] : [],
    topLevelKeys: Array.from(topLevelKeys).slice(0, 24),
    eventTypes: Array.from(eventTypes).slice(0, 24),
    projectPath,
    subagent,
    toolCalls,
  }
}

function sqliteJsonQuery(dbPath: string, sql: string): unknown[] {
  const output = execFileSync("sqlite3", ["-readonly", "-json", dbPath, sql], {
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024,
  })
  if (!output.trim()) return []
  const parsed = JSON.parse(output) as unknown
  return Array.isArray(parsed) ? parsed : []
}

function parseOpenCodeModel(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>
      const id = typeof obj.id === "string" ? obj.id : undefined
      return id ? [id] : []
    }
  } catch {
    // fall through
  }
  return [value]
}

function projectAdvice(path: string, cacheReadPercent: number | null): {
  hasAgentsMd?: boolean
  hasClaudeMd?: boolean
  advice: string[]
} {
  const hasAgentsMd = existsSync(join(path, "AGENTS.md"))
  const hasClaudeMd = existsSync(join(path, "CLAUDE.md"))
  const advice: string[] = []
  if (!hasAgentsMd) advice.push("Add AGENTS.md so Codex/OpenCode can start from stable repo rules instead of replaying ad hoc context.")
  if (!hasClaudeMd) advice.push("Add CLAUDE.md or point Claude Code to AGENTS.md so Claude sessions get the same stable prefix.")
  if (cacheReadPercent !== null && cacheReadPercent < 0.35) advice.push("Cache-read is low for this project; move logs, diffs, terminal output, and task-specific notes below stable repo instructions.")
  if (advice.length === 0) advice.push("Keep repo instruction files stable. Avoid timestamps, sprint notes, and current-task state in the stable files.")
  return { hasAgentsMd, hasClaudeMd, advice }
}

function parseSqliteCandidate(
  provider: LocalAgentProvider,
  dbPath: string,
  cutoffMs: number,
  redact: boolean
): ParseResult {
  const parserTried = parserName(provider, "sqlite")
  if (provider !== "opencode") return failed(parserTried, "sqlite parser is not implemented")

  try {
    const countRows = sqliteJsonQuery(
      dbPath,
      `SELECT COUNT(*) AS total, SUM(CASE WHEN time_updated >= ${Math.round(cutoffMs)} THEN 1 ELSE 0 END) AS in_window FROM session;`
    ) as Array<{ total?: number; in_window?: number }>
    const discoveredSessions = Number(countRows[0]?.total ?? 0)
    const sessionsInWindow = Number(countRows[0]?.in_window ?? 0)
    if (sessionsInWindow === 0) {
      return {
        ...failed(parserTried, "no sessions in requested time window"),
        discoveredSessions,
        sessionsInWindow,
        topLevelKeys: ["session"],
        eventTypes: ["sqlite:session"],
      }
    }

    const rows = sqliteJsonQuery(
      dbPath,
      [
        "SELECT",
        "s.id, s.title, s.model, s.agent, s.tokens_input, s.tokens_output, s.tokens_reasoning, s.tokens_cache_read, s.tokens_cache_write, s.cost, s.time_created, s.time_updated, p.worktree AS project_path",
        "FROM session s LEFT JOIN project p ON p.id = s.project_id",
        `WHERE s.time_updated >= ${Math.round(cutoffMs)}`,
        "ORDER BY s.time_updated DESC;",
      ].join(" ")
    ) as Array<Record<string, unknown>>

    const toolRows = sqliteJsonQuery(
      dbPath,
      `SELECT session_id, COUNT(*) AS tool_calls FROM part WHERE time_updated >= ${Math.round(cutoffMs)} AND data LIKE '%"type":"tool"%' GROUP BY session_id;`
    ) as Array<Record<string, unknown>>
    const toolBySession = new Map(toolRows.map((row) => [String(row.session_id), Number(row.tool_calls ?? 0)]))

    const subagentRows = sqliteJsonQuery(
      dbPath,
      `SELECT COALESCE(agent, 'unknown') AS name, COUNT(*) AS sessions FROM session WHERE time_updated >= ${Math.round(cutoffMs)} GROUP BY agent ORDER BY COUNT(*) DESC LIMIT 8;`
    ) as Array<Record<string, unknown>>

    const projectRows = sqliteJsonQuery(
      dbPath,
      [
        "SELECT COALESCE(p.worktree, 'unknown') AS path, COUNT(*) AS sessions,",
        "SUM(s.tokens_input+s.tokens_output+s.tokens_reasoning+s.tokens_cache_read+s.tokens_cache_write) AS total_tokens,",
        "SUM(s.tokens_cache_read) AS cache_read_tokens, SUM(s.tokens_input+s.tokens_cache_read+s.tokens_cache_write) AS cache_denominator,",
        "SUM(s.cost) AS cost",
        "FROM session s LEFT JOIN project p ON p.id = s.project_id",
        `WHERE s.time_updated >= ${Math.round(cutoffMs)}`,
        "GROUP BY path ORDER BY sessions DESC LIMIT 5;",
      ].join(" ")
    ) as Array<Record<string, unknown>>

    const projects = projectRows.map((row) => {
      const path = String(row.path ?? "unknown")
      const denom = Number(row.cache_denominator ?? 0)
      const cacheReadPercent = denom > 0 ? Number(row.cache_read_tokens ?? 0) / denom : null
      return {
        path,
        sessions: Number(row.sessions ?? 0),
        totalTokens: Number(row.total_tokens ?? 0),
        cacheReadPercent,
        modelCostUsd: Number(row.cost ?? 0),
        ...projectAdvice(path, cacheReadPercent),
      }
    })

    const sessions = rows.map((row) => {
      const models = parseOpenCodeModel(row.model)
      const inputTokens = Number(row.tokens_input ?? 0)
      const outputTokens = Number(row.tokens_output ?? 0) + Number(row.tokens_reasoning ?? 0)
      const cacheReadTokens = Number(row.tokens_cache_read ?? 0)
      const cacheWriteTokens = Number(row.tokens_cache_write ?? 0)
      const title = typeof row.title === "string" ? row.title : ""
      return {
        agent: "opencode" as const,
        path: `${dbPath}#${String(row.id ?? "session")}`,
        startedAt: new Date(Number(row.time_updated ?? row.time_created ?? Date.now())),
        text: redactText([title, ...models, `input tokens ${inputTokens}`, `cache read tokens ${cacheReadTokens}`].join("\n"), redact),
        models,
        parseWarnings: [],
        projectPath: typeof row.project_path === "string" ? row.project_path : undefined,
        subagent: typeof row.agent === "string" ? row.agent : undefined,
        toolCalls: toolBySession.get(String(row.id)) ?? 0,
        metrics: {
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheWriteTokens,
          costUsd: typeof row.cost === "number" ? row.cost : Number(row.cost ?? 0),
          tokenAccounting: "observed" as const,
        },
      }
    })

    return {
      status: "parsed",
      parserTried,
      text: sessions.map((session) => session.text).join("\n"),
      models: Array.from(new Set(sessions.flatMap((session) => session.models))),
      sessions,
      projects,
      activity: {
        toolCalls: Array.from(toolBySession.values()).reduce((sum, count) => sum + count, 0),
        subagentRuns: sessions.filter((session) => Boolean(session.subagent)).length,
        topSubagents: subagentRows.map((row) => ({
          name: String(row.name ?? "unknown"),
          sessions: Number(row.sessions ?? 0),
        })),
      },
      warnings: [],
      topLevelKeys: ["session.id", "session.model", "session.tokens_input", "session.tokens_cache_read", "session.cost"],
      eventTypes: ["sqlite:session"],
      discoveredSessions,
      sessionsInWindow,
    }
  } catch (e) {
    return failed(
      parserTried,
      `OpenCode SQLite parser failed: ${e instanceof Error ? e.message : String(e)}`
    )
  }
}

function failed(parserTried: string, reason: string): ParseResult {
  return {
    status: "failed",
    parserTried,
    reason,
    text: "",
    models: [],
    warnings: [],
    topLevelKeys: [],
    eventTypes: [],
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function parseClaudeRecord(record: Record<string, unknown>): string[] {
  const message = record.message
  const parts = [
    ...stringifyLeaf(record.content),
    ...stringifyLeaf(record.summary),
    ...stringifyLeaf(record.toolUseResult),
  ]
  if (message && typeof message === "object") {
    const msg = message as Record<string, unknown>
    parts.push(...stringifyLeaf(msg.content))
    parts.push(...stringifyLeaf(msg.text))
    parts.push(...stringifyLeaf(msg.usage))
  }
  return parts
}

function parseCodexRecord(record: Record<string, unknown>): string[] {
  const payload = record.payload && typeof record.payload === "object"
    ? (record.payload as Record<string, unknown>)
    : undefined
  return [
    ...stringifyLeaf(record.content),
    ...stringifyLeaf(record.text),
    ...stringifyLeaf(record.message),
    ...stringifyLeaf(payload?.content),
    ...stringifyLeaf(payload?.text),
    ...stringifyLeaf(payload?.message),
    ...stringifyLeaf(payload?.input),
    ...stringifyLeaf(payload?.output),
    ...stringifyLeaf(payload?.delta),
    ...stringifyLeaf(payload?.items),
    ...stringifyLeaf(payload?.summary),
  ]
}

function codexSubagentName(payload: Record<string, unknown> | undefined): string | undefined {
  if (!payload) return undefined
  if (asString(payload.thread_source) !== "subagent" && !payload.parent_thread_id) return undefined
  const role = asString(payload.agent_role)
  const nickname = asString(payload.agent_nickname)
  if (role && nickname) return `${role}:${nickname}`
  if (role) return role
  const source = payload.source && typeof payload.source === "object"
    ? (payload.source as Record<string, unknown>)
    : undefined
  const subagent = source?.subagent && typeof source.subagent === "object"
    ? (source.subagent as Record<string, unknown>)
    : undefined
  const spawned = subagent?.thread_spawn && typeof subagent.thread_spawn === "object"
    ? (subagent.thread_spawn as Record<string, unknown>)
    : undefined
  const spawnedRole = asString(spawned?.agent_role)
  const spawnedNickname = asString(spawned?.agent_nickname)
  if (spawnedRole && spawnedNickname) return `${spawnedRole}:${spawnedNickname}`
  if (spawnedRole) return spawnedRole
  const other = asString(subagent?.other)
  if (other) return other
  return "subagent"
}

function parseOpenCodeRecord(record: Record<string, unknown>): string[] {
  return [
    ...stringifyLeaf(record.content),
    ...stringifyLeaf(record.text),
    ...stringifyLeaf(record.message),
    ...stringifyLeaf(record.input),
    ...stringifyLeaf(record.output),
    ...stringifyLeaf(record.parts),
    ...stringifyLeaf(record.messages),
  ]
}

function redactText(text: string, enabled: boolean): string {
  if (!enabled) return text
  return text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/\b(?:sk|lsv2|ghp|gho|glpat|xoxb|xoxp)_[A-Za-z0-9_-]{16,}\b/g, "[redacted-token]")
    .replace(/\b(?:api[_-]?key|token|password|secret)\s*[:=]\s*["']?[^"'\s]+/gi, "$1=[redacted]")
}

function pricingForModel(rawName: string): ModelPricing | undefined {
  for (const [pattern, pricing] of MODEL_ALIASES) {
    pattern.lastIndex = 0
    if (pattern.test(rawName)) return pricing
  }
  return undefined
}

function loadSessions(options: LocalAuditOptions): {
  sessions: LocalSession[]
  found: Map<LocalAgentProvider, number>
  inWindowFound: Map<LocalAgentProvider, number>
  detected: Set<LocalAgentProvider>
  diagnostics: CandidateDiagnostic[]
  rootPaths: Map<LocalAgentProvider, string[]>
  projects: LocalAgentReport["projects"]
  activity: LocalAgentReport["activity"]
} {
  const cutoff = windowStart(options.window, options.now ?? new Date())
  const sessions: LocalSession[] = []
  const found = new Map<LocalAgentProvider, number>()
  const inWindowFound = new Map<LocalAgentProvider, number>()
  const detected = new Set<LocalAgentProvider>()
  const diagnostics: CandidateDiagnostic[] = []
  const rootPaths = new Map<LocalAgentProvider, string[]>()
  const discoveredProjects: LocalAgentReport["projects"] = []
  const discoveredActivity: LocalAgentReport["activity"] = {
    toolCalls: 0,
    subagentRuns: 0,
    topSubagents: [],
  }
  const discoveredSubagents = new Map<string, number>()

  for (const root of detectRoots()) {
    rootPaths.set(root.agent, [...(rootPaths.get(root.agent) ?? []), root.path])
    if (!existsSync(root.path)) continue
    detected.add(root.agent)
    const files = listFiles(root.path)
    found.set(root.agent, (found.get(root.agent) ?? 0) + files.length)

    for (const file of files) {
      const stat = safeStat(file)
      const candidateType = classifyCandidate(file)
      const diagnostic: CandidateDiagnostic = {
        provider: root.agent,
        rootPath: root.path,
        path: file,
        sizeBytes: stat ? Number(stat.size) : undefined,
        modifiedAt: stat?.mtime.toISOString(),
        modifiedMs: stat ? Number(stat.mtimeMs) : undefined,
        inWindow: Boolean(stat && Number(stat.mtimeMs) >= cutoff),
        candidateType,
        parserTried: parserName(root.agent, candidateType),
        parseStatus: "skipped",
        parseReason: stat ? "outside requested time window" : "unreadable stat",
      }
      diagnostics.push(diagnostic)
      if (!stat || Number(stat.mtimeMs) < cutoff) continue
      if (root.agent !== "opencode" || candidateType === "sqlite") {
        inWindowFound.set(root.agent, (inWindowFound.get(root.agent) ?? 0) + 1)
      }
      if (Number(stat.size) === 0) {
        diagnostic.parseStatus = "failed"
        diagnostic.parseReason = "empty file"
        continue
      }
      let parsed: ParseResult
      if (candidateType === "sqlite") {
        parsed = parseSqliteCandidate(root.agent, file, cutoff, options.redact !== false)
      } else {
        let raw: string
        try {
          raw = readFileSync(file, "utf-8")
        } catch {
          diagnostic.parseStatus = "failed"
          diagnostic.parseReason = "unreadable file"
          continue
        }
        parsed = parseCandidate(root.agent, candidateType, raw, options.redact !== false)
      }
      diagnostic.parseStatus = parsed.status
      diagnostic.parseReason = parsed.reason
      diagnostic.parserTried = parsed.parserTried
      diagnostic.topLevelKeys = parsed.topLevelKeys
      diagnostic.eventTypes = parsed.eventTypes
      diagnostic.discoveredSessions = parsed.discoveredSessions
      diagnostic.sessionsInWindow = parsed.sessionsInWindow
      if (parsed.projects?.length) parsed.projects.forEach((project) => discoveredProjects.push(project))
      if (parsed.activity) {
        discoveredActivity.toolCalls += parsed.activity.toolCalls
        discoveredActivity.subagentRuns += parsed.activity.subagentRuns
        for (const subagent of parsed.activity.topSubagents) {
          discoveredSubagents.set(subagent.name, (discoveredSubagents.get(subagent.name) ?? 0) + subagent.sessions)
        }
      }
      if (root.agent === "opencode" && parsed.discoveredSessions !== undefined) {
        found.set(root.agent, parsed.discoveredSessions)
        inWindowFound.set(root.agent, parsed.sessionsInWindow ?? 0)
      }
      if (parsed.status !== "parsed") continue
      if (parsed.sessions?.length) {
        sessions.push(...parsed.sessions)
        continue
      }
      const estimatedInputTokens = approximateTokens(parsed.text)
      sessions.push({
        agent: root.agent,
        path: file,
        startedAt: stat.mtime,
        text: parsed.text,
        models: Array.from(new Set(parsed.models)),
        parseWarnings: parsed.warnings,
        projectPath: parsed.projectPath,
        subagent: parsed.subagent,
        toolCalls: parsed.toolCalls ?? parsed.eventTypes.filter((type) => /tool|function_call/i.test(type)).length,
        metrics: {
          inputTokens: estimatedInputTokens,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          costUsd: null,
          tokenAccounting: "estimated",
        },
      })
    }
  }

  discoveredActivity.topSubagents = Array.from(discoveredSubagents.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, sessionCount]) => ({ name, sessions: sessionCount }))
  return {
    sessions,
    found,
    detected,
    diagnostics,
    rootPaths,
    inWindowFound,
    projects: discoveredProjects,
    activity: discoveredActivity,
  }
}

function hasWeakMarkdown(projectRoot: string | undefined, filename: "AGENTS.md" | "CLAUDE.md"): boolean {
  if (!projectRoot) return true
  const path = resolve(projectRoot, filename)
  try {
    const text = readFileSync(path, "utf-8")
    return approximateTokens(text) < 120 || !/rules|instructions|layout|testing|commands/i.test(text)
  } catch {
    return true
  }
}

function repeatedStableContext(sessions: LocalSession[]): number {
  let repeated = 0
  const seen = new Set<string>()
  for (const session of sessions) {
    const stableLines = session.text
      .split(/\r?\n/)
      .filter((line) => line.length > 30 && STABLE_CONTEXT_PATTERNS.some((p) => p.test(line)))
      .slice(0, 12)
    const key = stableLines.join("\n").slice(0, 1200)
    if (!key) continue
    if (seen.has(key)) repeated++
    seen.add(key)
  }
  return repeated
}

function signalsFor(sessions: LocalSession[], unknownModelCount: number): AgentSignals {
  let dynamicEarly = 0
  let largeDynamicEarly = 0
  let longWithoutSummary = 0
  let malformed = 0
  let totalEstimatedInputTokens = 0
  let reusableEstimatedTokens = 0

  for (const session of sessions) {
    const tokens = session.metrics.inputTokens + session.metrics.outputTokens
    const transcriptTokens = approximateTokens(session.text)
    totalEstimatedInputTokens += tokens
    const early = session.text.slice(0, Math.min(5000, Math.floor(session.text.length * 0.35)))
    if (DYNAMIC_PATTERNS.some((pattern) => pattern.test(early))) dynamicEarly++
    if (approximateTokens(early) > 1200 && DYNAMIC_PATTERNS.some((pattern) => pattern.test(early))) largeDynamicEarly++
    if (tokens > 12000 && transcriptTokens > 1200 && !SUMMARY_PATTERNS.some((pattern) => pattern.test(session.text))) longWithoutSummary++
    if (session.parseWarnings.length > 0) malformed++
    reusableEstimatedTokens += Math.max(0, Math.round(tokens * reusableRatio(session.text)))
  }

  return {
    sessionsAnalyzed: sessions.length,
    dynamicEarly,
    largeDynamicEarly,
    repeatedContext: repeatedStableContext(sessions),
    longWithoutSummary,
    unknownPricing: unknownModelCount,
    malformed,
    totalEstimatedInputTokens,
    reusableEstimatedTokens,
  }
}

function reusableRatio(text: string): number {
  const stableHits = STABLE_CONTEXT_PATTERNS.filter((pattern) => pattern.test(text)).length
  const dynamicHits = DYNAMIC_PATTERNS.filter((pattern) => pattern.test(text.slice(0, 5000))).length
  return Math.max(0.05, Math.min(0.45, stableHits * 0.08 + dynamicHits * 0.05))
}

function scoreFromSignals(signals: AgentSignals, weakAgents: boolean): number {
  const sessionsAnalyzed = Math.max(1, signals.sessionsAnalyzed)
  const dynamicRate = signals.dynamicEarly / sessionsAnalyzed
  const largeDynamicRate = signals.largeDynamicEarly / sessionsAnalyzed
  const repeatedRate = signals.repeatedContext / sessionsAnalyzed
  const longRate = signals.longWithoutSummary / sessionsAnalyzed
  let score = 100
  score -= Math.min(35, dynamicRate * 35)
  score -= Math.min(20, largeDynamicRate * 20)
  score -= Math.min(25, repeatedRate * 25)
  score -= Math.min(35, longRate * 35)
  score -= Math.min(8, signals.unknownPricing * 0.5)
  score -= Math.min(8, signals.malformed * 1.5)
  if (weakAgents) score -= 8
  return Math.max(0, Math.min(100, Math.round(score)))
}

function localScore(
  _stats: ReturnType<typeof sessionStats>,
  signals: AgentSignals,
  weakAgents: boolean
): number {
  return scoreFromSignals(signals, weakAgents)
}

function missRange(score: number): { lowPercent: number; highPercent: number } {
  const leak = 100 - score
  return {
    lowPercent: Math.max(5, Math.min(95, Math.round(leak * 0.45))),
    highPercent: Math.max(10, Math.min(98, Math.round(leak * 0.85))),
  }
}

function cashRange(sessions: LocalSession[], signals: AgentSignals): { low?: number; high?: number; currency: "USD"; label: "estimated" } | undefined {
  let weightedInputCost = 0
  let knownTokens = 0
  for (const session of sessions) {
    const model = session.models.map(pricingForModel).find((p) => p?.inputUsdPerMTok)
    if (!model?.inputUsdPerMTok) continue
    const tokens = approximateTokens(session.text)
    weightedInputCost += tokens * model.inputUsdPerMTok
    knownTokens += tokens
  }
  if (knownTokens === 0) return undefined
  const blendedPerMTok = weightedInputCost / knownTokens
  const avoidableTokens = signals.reusableEstimatedTokens
  return {
    low: Number(((avoidableTokens * blendedPerMTok * 0.35) / 1_000_000).toFixed(2)),
    high: Number(((avoidableTokens * blendedPerMTok * 0.8) / 1_000_000).toFixed(2)),
    currency: "USD",
    label: "estimated",
  }
}

function sessionStats(sessions: LocalSession[]): {
  totalTokens: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  cacheReadPercent: number | null
  modelCostUsd: number | null
  tokenAccounting: "observed" | "estimated" | "mixed" | "unavailable"
} {
  const inputTokens = sessions.reduce((sum, session) => sum + session.metrics.inputTokens, 0)
  const outputTokens = sessions.reduce((sum, session) => sum + session.metrics.outputTokens, 0)
  const cacheReadTokens = sessions.reduce((sum, session) => sum + session.metrics.cacheReadTokens, 0)
  const cacheWriteTokens = sessions.reduce((sum, session) => sum + session.metrics.cacheWriteTokens, 0)
  const totalTokens = inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens
  const observedSessions = sessions.filter((session) => session.metrics.tokenAccounting === "observed")
  const observedInputTokens = observedSessions.reduce((sum, session) => sum + session.metrics.inputTokens, 0)
  const observedCacheReadTokens = observedSessions.reduce((sum, session) => sum + session.metrics.cacheReadTokens, 0)
  const observedCacheWriteTokens = observedSessions.reduce((sum, session) => sum + session.metrics.cacheWriteTokens, 0)
  const cacheDenominator = observedInputTokens + observedCacheReadTokens + observedCacheWriteTokens
  const observed = sessions.filter((session) => session.metrics.tokenAccounting === "observed").length
  const estimated = sessions.filter((session) => session.metrics.tokenAccounting === "estimated").length
  const costValues = sessions
    .map((session) => session.metrics.costUsd)
    .filter((cost): cost is number => typeof cost === "number" && Number.isFinite(cost))
  return {
    totalTokens,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    cacheReadPercent: cacheDenominator > 0 ? cacheReadTokens / cacheDenominator : null,
    modelCostUsd: costValues.length > 0 ? Number(costValues.reduce((sum, cost) => sum + cost, 0).toFixed(2)) : null,
    tokenAccounting:
      observed > 0 && estimated > 0
        ? "mixed"
        : observed > 0
          ? "observed"
          : estimated > 0
            ? "estimated"
            : "unavailable",
  }
}

function isReportableProjectPath(path: string | undefined): path is string {
  if (!path) return false
  if (path === "unknown" || path === "/") return false
  return path.startsWith("/")
}

function summarizeProjectsFromSessions(
  sessions: LocalSession[],
  fallbackProjects: LocalAgentReport["projects"]
): LocalAgentReport["projects"] {
  const byPath = new Map<string, LocalSession[]>()
  for (const session of sessions) {
    if (!isReportableProjectPath(session.projectPath)) continue
    const existing = byPath.get(session.projectPath) ?? []
    existing.push(session)
    byPath.set(session.projectPath, existing)
  }

  const projects = Array.from(byPath.entries()).map(([path, projectSessions]) => {
    const stats = sessionStats(projectSessions)
    return {
      path,
      sessions: projectSessions.length,
      totalTokens: stats.totalTokens,
      cacheReadPercent: stats.cacheReadPercent,
      modelCostUsd: stats.modelCostUsd,
      ...projectAdvice(path, stats.cacheReadPercent),
    }
  })

  const ranked = projects.sort((a, b) => b.sessions - a.sessions || b.totalTokens - a.totalTokens || a.path.localeCompare(b.path))
  if (ranked.length > 0) return ranked
  return fallbackProjects
    .filter((project) => isReportableProjectPath(project.path))
    .sort((a, b) => b.sessions - a.sessions || b.totalTokens - a.totalTokens || a.path.localeCompare(b.path))
}

function confidence(sessionsAnalyzed: number, modelCount: number, cashKnown: boolean): Confidence {
  if (sessionsAnalyzed >= 20 && modelCount > 0 && cashKnown) return "medium"
  if (sessionsAnalyzed >= 5 && modelCount > 0) return "medium"
  return "low"
}

function finding(id: string, title: string, evidence: string, recommendation: string, severity: "low" | "medium" | "high", agent?: LocalAgentProvider): LocalAgentFinding {
  return { id, title, severity, agent, evidence, recommendation }
}

function diagnosticZeroFinding(): LocalAgentFinding {
  return finding(
    "local-sessions-found-not-parsed",
    "Local sessions were found but not parsed.",
    "Cachecatch cannot estimate cache leak, models, token usage, or context patterns until it can read the session format.",
    "Run with --debug and add parser support for the detected file shapes.",
    "medium"
  )
}

function recommendations(weakAgents: boolean, weakClaude: boolean, includeClaude: boolean): LocalAgentRecommendation[] {
  const out: LocalAgentRecommendation[] = [
    {
      id: "move-dynamic-tail",
      title: "Keep dynamic context late",
      action: "Keep terminal output, logs, stack traces, and git diffs at the end of the task context after stable repo rules.",
    },
    {
      id: "summarize-old-sessions",
      title: "Summarize old sessions",
      action: "Summarize old sessions instead of replaying full transcripts when continuing work.",
    },
    {
      id: "stable-repo-rules",
      title: "Keep repo rules stable",
      action: "Keep stable repo rules stable and avoid timestamps, sprint notes, or per-task state inside them.",
    },
  ]
  if (weakAgents) {
    out.unshift({
      id: "create-agents-md",
      title: "Create or update AGENTS.md",
      action: "Move stable project context, commands, privacy rules, and testing expectations into AGENTS.md.",
      suggestedMarkdown: {
        filename: "AGENTS.md",
        content: [
          "# Agent Instructions",
          "",
          "## Project Rules",
          "- Keep analysis logic in src/engine.",
          "- Keep provider HTTP logic in src/adapters.",
          "- Do not include timestamps, temporary logs, or task-specific diffs in this file.",
          "",
          "## Commands",
          "- npm run typecheck",
          "- npm test",
          "",
          "## Context Hygiene",
          "- Put stable repo rules before dynamic task details.",
          "- Put terminal output, logs, stack traces, and git diffs at the end of task context.",
        ].join("\n"),
      },
    })
  }
  if (weakClaude && includeClaude) {
    out.push({
      id: "create-claude-md",
      title: "Create or update CLAUDE.md",
      action: "For Claude Code, mirror stable repo rules in CLAUDE.md or point it to AGENTS.md.",
      suggestedMarkdown: {
        filename: "CLAUDE.md",
        content: "# Claude Code Instructions\n\nRead AGENTS.md first. Keep stable project rules unchanged between sessions. Put logs, diffs, and command output after the stable instructions.",
      },
    })
  }
  return out
}

function summarizeModels(sessions: LocalSession[]): LocalAgentModelSummary[] {
  const counts = new Map<string, number>()
  for (const session of sessions) {
    for (const model of session.models.length ? session.models : ["unknown"]) {
      counts.set(model, (counts.get(model) ?? 0) + 1)
    }
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([rawName, count]) => {
    const pricing = pricingForModel(rawName)
    return {
      rawName,
      normalizedName: pricing?.normalizedName,
      provider: pricing?.provider,
      sessions: count,
      pricingKnown: typeof pricing?.inputUsdPerMTok === "number",
      pricingConfidence: pricing?.pricingConfidence ?? "low",
      note: pricing?.inputUsdPerMTok ? "Based on built-in model pricing assumptions." : "Pricing unknown; dollar estimates exclude this model.",
    }
  })
}

function buildDiagnostics(
  diagnostics: CandidateDiagnostic[],
  rootPaths: Map<LocalAgentProvider, string[]>,
  debugSample: number
): LocalAgentReport["diagnostics"] {
  const providers = (["claude-code", "codex", "opencode"] as LocalAgentProvider[]).map((provider) => {
    const items = diagnostics.filter((item) => item.provider === provider)
    const inWindow = items.filter((item) => item.inWindow)
    const failures = new Map<string, number>()
    for (const item of inWindow.filter((i) => i.parseStatus === "failed")) {
      const reason = item.parseReason ?? "unknown failure"
      failures.set(reason, (failures.get(reason) ?? 0) + 1)
    }
    const sampleCandidates = inWindow.slice(0, debugSample).map((item) => ({
      path: item.path,
      sizeBytes: item.sizeBytes,
      modifiedAt: item.modifiedAt,
      candidateType: item.candidateType,
      parserTried: item.parserTried,
      parseStatus: item.parseStatus,
      parseReason: item.parseReason,
      topLevelKeys: item.topLevelKeys,
      eventTypes: item.eventTypes,
    }))
    return {
      provider,
      rootPaths: rootPaths.get(provider) ?? [],
      candidatesFound: items.length,
      candidatesInWindow: inWindow.length,
      filesAttempted: inWindow.length,
      parsedSessions: inWindow.filter((item) => item.parseStatus === "parsed").length,
      skippedFiles: inWindow.filter((item) => item.parseStatus === "skipped").length,
      failedFiles: inWindow.filter((item) => item.parseStatus === "failed").length,
      topFailureReasons: Array.from(failures.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([reason, count]) => ({ reason, count })),
      sampleCandidates,
    }
  })
  return { providers }
}

export function buildLocalAgentAudit(options: LocalAuditOptions): LocalAgentReport {
  const projectRoot = options.project ? resolve(options.project) : process.cwd()
  const debugSample = Math.max(1, Math.min(100, options.debugSample ?? 20))
  const {
    sessions,
    found,
    inWindowFound,
    detected,
    diagnostics: rawDiagnostics,
    rootPaths,
    projects,
    activity,
  } = loadSessions(options)
  const diagnostics = buildDiagnostics(rawDiagnostics, rootPaths, debugSample)
  const candidatesFound = Array.from(found.values()).reduce((sum, count) => sum + count, 0)
  const candidatesInWindow = Array.from(inWindowFound.values()).reduce((sum, count) => sum + count, 0)

  if (sessions.length === 0) {
    const mainFinding = candidatesFound > 0
      ? ZERO_PARSED_FINDING
      : "No local agent sessions were found in supported locations."
    const diagnosticFinding = candidatesFound > 0 ? [diagnosticZeroFinding()] : []
    return {
      reportType: "local-agent-context-audit",
      generatedAt: (options.now ?? new Date()).toISOString(),
      window: options.window,
      summary: {
        status: candidatesFound > 0 ? "Sessions found, but none could be parsed." : "No sessions found.",
        cacheLeakScore: null,
        recoverableCashSaving: null,
        estimatedCacheMissRange: null,
        agentsScanned: detected.size,
        sessionsFound: candidatesFound,
        sessionsInWindow: candidatesInWindow,
        sessionsAnalyzed: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cacheReadPercent: null,
        modelCostUsd: null,
        tokenAccounting: "unavailable",
        toolCalls: 0,
        subagentRuns: 0,
        modelsDetected: 0,
        confidence: "low",
        mainFinding,
      },
      agents: (["claude-code", "codex", "opencode"] as LocalAgentProvider[]).map((agent) => ({
        provider: agent,
        detected: detected.has(agent),
        sessionsFound: found.get(agent) ?? 0,
        sessionsInWindow: inWindowFound.get(agent) ?? 0,
        sessionsAnalyzed: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cacheReadPercent: null,
        modelCostUsd: null,
        tokenAccounting: "unavailable",
        toolCalls: 0,
        subagentRuns: 0,
        topSubagents: [],
        modelsDetected: [],
        cacheLeakScore: 0,
        mainFinding: (found.get(agent) ?? 0) > 0 ? mainFinding : "No local session candidates found.",
        findings: diagnosticFinding,
        recommendations: [],
      })),
      modelsDetected: [],
      projects: [],
      activity: { toolCalls: 0, subagentRuns: 0, topSubagents: [] },
      findings: diagnosticFinding,
      recommendations: [],
      diagnostics,
      pricingDisclaimer: PRICING_DISCLAIMER,
    }
  }

  const weakAgents = hasWeakMarkdown(projectRoot, "AGENTS.md")
  const weakClaude = hasWeakMarkdown(projectRoot, "CLAUDE.md")
  const allModels = summarizeModels(sessions)
  const unknownModelCount = allModels.filter((m) => !m.pricingKnown).length
  const allSignals = signalsFor(sessions, unknownModelCount)
  const cash = cashRange(sessions, allSignals)
  const recs = recommendations(weakAgents, weakClaude, sessions.some((session) => session.agent === "claude-code"))
  const allStats = sessionStats(sessions)
  const allScore = localScore(allStats, allSignals, weakAgents)
  const rankedProjects = summarizeProjectsFromSessions(sessions, projects)

  const globalFindings: LocalAgentFinding[] = []
  if (allSignals.longWithoutSummary > 0) globalFindings.push(finding("long-sessions-no-summary", "Very long sessions without summaries", `${allSignals.longWithoutSummary} parsed long session(s) did not show clear summary/compaction markers.`, "Summarize old sessions instead of replaying full transcripts.", "medium"))
  if (allSignals.dynamicEarly > 0) globalFindings.push(finding("dynamic-context-early", "Dynamic logs/diffs/tool output appear early", `${allSignals.dynamicEarly} parsed session(s) had volatile command output, timestamps, errors, or diffs near the beginning.`, "Move terminal output, logs, stack traces, and git diffs to the end of task context.", "high"))
  if (weakAgents) globalFindings.push(finding("weak-agents-md", "Missing or weak AGENTS.md", "AGENTS.md was missing, short, or did not contain stable repo instructions.", "Create or update AGENTS.md with stable repo rules and commands.", "medium"))
  if (weakClaude && sessions.some((session) => session.agent === "claude-code")) globalFindings.push(finding("weak-claude-md", "Missing or weak CLAUDE.md", "Claude Code was detected and parsed, but CLAUDE.md was missing or weak.", "Create or update CLAUDE.md or point it to AGENTS.md.", "low", "claude-code"))
  if (allSignals.repeatedContext > 0) globalFindings.push(finding("repeated-project-context", "Repeated stable project context across sessions", `${allSignals.repeatedContext} parsed session(s) repeated stable project instructions that could live in markdown files.`, "Move stable project context into AGENTS.md and/or CLAUDE.md.", "medium"))
  if (sessions.some((session) => session.agent !== "opencode" && session.metrics.tokenAccounting === "estimated")) {
    globalFindings.push(finding("local-cache-telemetry-not-reported", "Some local agents do not report cache telemetry", "Codex/Claude local transcript files parsed by Cachecatch do not expose cache-read/cache-write token fields, so their cache percentage is shown as not reported instead of guessed.", "This is a local telemetry visibility limitation, not proof that you used the agent incorrectly. Use the context-structure findings below to fix behavior that is actually visible.", "low"))
  }
  if (unknownModelCount > 0) globalFindings.push(finding("unknown-model-pricing", "Unknown model pricing", `${unknownModelCount} detected model name(s) did not match Cachecatch's built-in pricing registry.`, "Keep token/cache percentages, but treat dollar estimates as partial until the pricing map covers those exact model strings.", "low"))
  if (allStats.cacheReadTokens + allStats.cacheWriteTokens === 0 && !globalFindings.some((item) => item.id === "local-cache-telemetry-not-reported")) {
    globalFindings.push(finding("no-cache-telemetry", "No observed cache telemetry", "Parsed local agent transcripts do not expose reliable cache-read/cache-creation telemetry.", "Treat cash saving as estimated, not guaranteed.", "low"))
  }

  const agents = (["claude-code", "codex", "opencode"] as LocalAgentProvider[]).map((agent) => {
    const agentSessions = sessions.filter((session) => session.agent === agent)
    const agentModels = summarizeModels(agentSessions)
    const agentSignals = signalsFor(agentSessions, agentModels.filter((m) => !m.pricingKnown).length)
    const agentStats = sessionStats(agentSessions)
    const agentWeak = agent === "claude-code" ? weakClaude : weakAgents
    const agentScore = agentSessions.length > 0 ? localScore(agentStats, agentSignals, agentWeak) : 0
    const agentFindings = agentSessions.length > 0 ? globalFindings.filter((item) => !item.agent || item.agent === agent) : []
    return {
      provider: agent,
      detected: detected.has(agent),
      sessionsFound: found.get(agent) ?? 0,
      sessionsInWindow: inWindowFound.get(agent) ?? 0,
      sessionsAnalyzed: agentSessions.length,
      totalTokens: agentStats.totalTokens,
      inputTokens: agentStats.inputTokens,
      outputTokens: agentStats.outputTokens,
      cacheReadTokens: agentStats.cacheReadTokens,
      cacheWriteTokens: agentStats.cacheWriteTokens,
      cacheReadPercent: agentStats.cacheReadPercent,
      modelCostUsd: agentStats.modelCostUsd,
      tokenAccounting: agentStats.tokenAccounting,
      toolCalls: agentSessions.reduce((sum, session) => sum + session.toolCalls, 0),
      subagentRuns: agentSessions.filter((session) => Boolean(session.subagent)).length,
      topSubagents: Array.from(
        agentSessions.reduce((map, session) => {
          if (session.subagent) map.set(session.subagent, (map.get(session.subagent) ?? 0) + 1)
          return map
        }, new Map<string, number>())
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, sessions: count })),
      modelsDetected: agentModels.filter((m) => m.rawName !== "unknown" && m.rawName !== "<synthetic>").map((m) => m.rawName),
      cacheLeakScore: agentScore,
      estimatedCacheMissRange: agentSessions.length > 0 ? missRange(agentScore) : undefined,
      recoverableCashSaving: cashRange(agentSessions, agentSignals),
      mainFinding:
        agentSessions.length === 0 && (found.get(agent) ?? 0) > 0
          ? "Sessions found, but none could be parsed in the requested time window."
          : agentSessions.length === 0
            ? "No local session candidates found."
            : agentFindings[0]?.title ?? "No major local context-cache breaker detected.",
      findings: agentFindings,
      recommendations: agentSessions.length > 0 ? recs : [],
    }
  })

  const observedCacheAgents = Array.from(new Set(sessions.filter((session) => session.metrics.tokenAccounting === "observed").map((session) => session.agent)))
  const observedCacheLabel = observedCacheAgents.length > 0
    ? observedCacheAgents.map((agent) => agent === "claude-code" ? "Claude Code" : agent === "codex" ? "Codex" : "OpenCode").join(", ")
    : "local agents with visible cache telemetry"
  const cacheSentence = allStats.cacheReadPercent === null
    ? "Cache-read telemetry was not visible in the parsed local files."
    : `Observed ${observedCacheLabel} cache read is ${Math.round(allStats.cacheReadPercent * 100)}%.`
  const telemetrySentence = sessions.some((session) => session.agent !== "opencode" && session.metrics.tokenAccounting === "estimated")
    ? " Local Claude/Codex cache telemetry is not visible, so those agents are not counted as 0%."
    : ""

  return {
    reportType: "local-agent-context-audit",
    generatedAt: (options.now ?? new Date()).toISOString(),
    window: options.window,
    summary: {
      status: "Parsed local sessions.",
      cacheLeakScore: allScore,
      recoverableCashSaving: cash ?? null,
      estimatedCacheMissRange: missRange(allScore),
      agentsScanned: detected.size,
      sessionsFound: candidatesFound,
      sessionsInWindow: candidatesInWindow,
      sessionsAnalyzed: sessions.length,
      totalTokens: allStats.totalTokens,
      inputTokens: allStats.inputTokens,
      outputTokens: allStats.outputTokens,
      cacheReadTokens: allStats.cacheReadTokens,
      cacheWriteTokens: allStats.cacheWriteTokens,
      cacheReadPercent: allStats.cacheReadPercent,
      modelCostUsd: allStats.modelCostUsd,
      tokenAccounting: allStats.tokenAccounting,
      toolCalls: activity.toolCalls + sessions.filter((session) => session.agent !== "opencode").reduce((sum, session) => sum + session.toolCalls, 0),
      subagentRuns: activity.subagentRuns,
      modelsDetected: allModels.filter((m) => m.rawName !== "unknown" && m.rawName !== "<synthetic>").length,
      confidence: confidence(sessions.length, allModels.length, Boolean(cash)),
      mainFinding: `Cachecatch analyzed ${sessions.length.toLocaleString("en-US")} coding-agent sessions, ${allStats.totalTokens.toLocaleString("en-US")} token activity, ${(activity.toolCalls + sessions.filter((session) => session.agent !== "opencode").reduce((sum, session) => sum + session.toolCalls, 0)).toLocaleString("en-US")} tool calls, and ${activity.subagentRuns.toLocaleString("en-US")} subagent runs. ${cacheSentence}${telemetrySentence}`,
    },
    agents,
    modelsDetected: allModels.filter((m) => m.rawName !== "unknown" && m.rawName !== "<synthetic>"),
    projects: rankedProjects,
    activity: {
      toolCalls: activity.toolCalls + sessions.filter((session) => session.agent !== "opencode").reduce((sum, session) => sum + session.toolCalls, 0),
      subagentRuns: activity.subagentRuns,
      topSubagents: activity.topSubagents,
    },
    findings: globalFindings,
    recommendations: recs,
    diagnostics,
    pricingDisclaimer: PRICING_DISCLAIMER,
  }
}

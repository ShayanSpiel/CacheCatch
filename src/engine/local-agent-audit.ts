import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, extname, join, resolve, sep } from "node:path"
import { pricingForModel as registryPricingForModel } from "./pricing.ts"
import { adviceForLocalProject as adviceForLocalProjectFn, type FixAdvice } from "./advice.ts"
import type {
  AgentTelemetrySource,
  AgentTelemetryVisibility,
  AuditWindow,
  Confidence,
  LocalAgentFinding,
  LocalAgentModelSummary,
  LocalAgentProvider,
  LocalAgentRecommendation,
  LocalAgentReport,
  Metric,
  NormalizedAgentTelemetry,
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
    cachedInputTokens: number
    cacheCreationTokens: number
    costUsd: number | null
    tokenAccounting: "observed" | "estimated"
    hasTokenTelemetry: boolean
    hasCacheTelemetry: boolean
    cacheFieldPresent: boolean
    costFieldPresent: boolean
    cacheReadDenominatorTokens: number | null
    source: AgentTelemetrySource
    visibility: AgentTelemetryVisibility
    confidenceNotes: string[]
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
  telemetry?: NormalizedAgentTelemetry
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

type MarkdownStatus = "missing" | "weak" | "present" | "unknown"

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
  const home = process.env.CACHECATCH_TEST_HOME || homedir()
  const roots: AgentRoot[] = [
    { agent: "claude-code", path: join(home, ".claude", "projects") },
    { agent: "codex", path: join(home, ".codex", "sessions") },
    { agent: "codex", path: join(home, ".codex", "archived_sessions") },
    { agent: "codex", path: join(home, ".cachecatch", "telemetry", "codex") },
    { agent: "claude-code", path: join(home, ".cachecatch", "telemetry", "claude-code") },
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

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function normalizeFieldName(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase()
}

interface FieldHit {
  path: string
  key: string
  value: number
}

function walkNumericFields(value: unknown, out: FieldHit[], path = "", depth = 0): void {
  if (depth > 10 || value === null || value === undefined) return
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkNumericFields(item, out, `${path}[${index}]`, depth + 1))
    return
  }
  if (typeof value !== "object") return
  const obj = value as Record<string, unknown>
  for (const [key, child] of Object.entries(obj)) {
    const childPath = path ? `${path}.${key}` : key
    const number = asNumber(child)
    if (number !== undefined) out.push({ path: childPath, key, value: number })
    walkNumericFields(child, out, childPath, depth + 1)
  }
}

function readPath(value: unknown, path: string): unknown {
  let current = value
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function candidateSessionId(record: Record<string, unknown>, fallback: string): string {
  const candidates = [
    record.session_id,
    record.sessionId,
    readPath(record, "session.id"),
    readPath(record, "payload.session_id"),
    readPath(record, "payload.session.id"),
    readPath(record, "conversation_id"),
    readPath(record, "payload.conversation_id"),
    readPath(record, "run_id"),
    readPath(record, "request_id"),
  ]
  return candidates.map(asString).find(Boolean) ?? fallback
}

function telemetrySource(provider: LocalAgentProvider, type: CandidateType, eventTypes: Set<string>): AgentTelemetrySource {
  if (type === "sqlite") return "local_db"
  const joined = Array.from(eventTypes).join(" ").toLowerCase()
  if (/otel|claude_code\.|response\.completed|codex\.sse_event|token\.usage/.test(joined)) {
    if (/metric|token\.usage/.test(joined)) return "otel_metrics"
    return "otel_logs"
  }
  if (provider === "codex" || provider === "claude-code") return "local_jsonl"
  return type === "json" || type === "jsonl" ? "local_jsonl" : "transcript"
}

interface TokenBucket {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  cacheWriteTokens: number
  cachedInputTokens: number
  costUsd: number
  requestCount: number
  errorCount: number
  fields: Set<string>
  models: Set<string>
  inputTokensMeaning: "uncached_only" | "total_input_including_cached" | "unknown"
  cachedInputMeaning: "separate_cache_read" | "subset_of_input" | "unknown"
  tokenEventMode?: "cumulative" | "per_turn" | "mixed" | "none"
  normalizedRows: string[]
  duplicateEvents: number
}

type NumericTokenBucketKey =
  | "inputTokens"
  | "outputTokens"
  | "totalTokens"
  | "cacheReadTokens"
  | "cacheCreationTokens"
  | "cacheWriteTokens"
  | "cachedInputTokens"
  | "costUsd"
  | "requestCount"
  | "errorCount"

function emptyBucket(): TokenBucket {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    cacheWriteTokens: 0,
    cachedInputTokens: 0,
    costUsd: 0,
    requestCount: 0,
    errorCount: 0,
    fields: new Set<string>(),
    models: new Set<string>(),
    inputTokensMeaning: "unknown",
    cachedInputMeaning: "unknown",
    tokenEventMode: "none",
    normalizedRows: [],
    duplicateEvents: 0,
  }
}

function addField(bucket: TokenBucket, canonical: NumericTokenBucketKey, hit: FieldHit, value = hit.value): void {
  if (!Number.isFinite(value)) return
  bucket[canonical] += value
  bucket.fields.add(`${canonical}:${hit.path}`)
}

function canonicalTokenField(hit: FieldHit): NumericTokenBucketKey | undefined {
  const key = normalizeFieldName(hit.key)
  const path = normalizeFieldName(hit.path)
  if (/costusd|usd|amountusd/.test(key) && /cost/.test(path)) return "costUsd"
  if (/errorcount|errors/.test(key)) return "errorCount"
  if (/requestcount|requests/.test(key)) return "requestCount"
  if (/cacheread|cachedtokens|cachedinput|cachedinputtokens/.test(path)) {
    return /prompttokensdetails|inputtokensdetails/.test(path) && key !== "cachedtokens"
      ? undefined
      : /cachecreation|cachewrite/.test(path)
        ? undefined
        : key === "totalTokens"
          ? undefined
          : "cacheReadTokens"
  }
  if (/cachecreation|cachewrite|cachewritetokens|cachecreationtokens/.test(path)) {
    return /write/.test(path) ? "cacheWriteTokens" : "cacheCreationTokens"
  }
  if (/inputtokens|prompttokens|tokensinput/.test(path) && !/cached|cache/.test(path)) return "inputTokens"
  if (/outputtokens|completiontokens|tokensoutput/.test(path) && !/reasoning/.test(path)) return "outputTokens"
  if (/reasoningoutput|reasoningtokens|tokensreasoning/.test(path)) return "outputTokens"
  if (/totaltokens|tokenstotal/.test(path)) return "totalTokens"
  return undefined
}

function hasNumericPath(value: unknown, path: string): boolean {
  return asNumber(readPath(value, path)) !== undefined
}

function preferredUsagePayload(record: Record<string, unknown>): {
  value: Record<string, unknown> | undefined
  modeHint: "cumulative" | "per_turn" | undefined
  sourcePath?: string
} {
  const payload = record.payload && typeof record.payload === "object" ? record.payload as Record<string, unknown> : undefined
  const info = payload?.info && typeof payload.info === "object" ? payload.info as Record<string, unknown> : undefined
  if (info?.last_token_usage && typeof info.last_token_usage === "object") {
    return { value: info.last_token_usage as Record<string, unknown>, modeHint: "per_turn", sourcePath: "payload.info.last_token_usage" }
  }
  if (payload?.last_token_usage && typeof payload.last_token_usage === "object") {
    return { value: payload.last_token_usage as Record<string, unknown>, modeHint: "per_turn", sourcePath: "payload.last_token_usage" }
  }
  if (record.last_token_usage && typeof record.last_token_usage === "object") {
    return { value: record.last_token_usage as Record<string, unknown>, modeHint: "per_turn", sourcePath: "last_token_usage" }
  }
  const tokenCount = record.token_count ?? payload?.token_count
  if (tokenCount && typeof tokenCount === "object") {
    return { value: tokenCount as Record<string, unknown>, modeHint: undefined, sourcePath: payload?.token_count ? "payload.token_count" : "token_count" }
  }
  if (info?.total_token_usage && typeof info.total_token_usage === "object") {
    return { value: info.total_token_usage as Record<string, unknown>, modeHint: "cumulative", sourcePath: "payload.info.total_token_usage" }
  }
  if (payload?.total_token_usage && typeof payload.total_token_usage === "object") {
    return { value: payload.total_token_usage as Record<string, unknown>, modeHint: "cumulative", sourcePath: "payload.total_token_usage" }
  }
  if (record.usage && typeof record.usage === "object") {
    return { value: record.usage as Record<string, unknown>, modeHint: "per_turn", sourcePath: "usage" }
  }
  if (payload?.usage && typeof payload.usage === "object") {
    return { value: payload.usage as Record<string, unknown>, modeHint: "per_turn", sourcePath: "payload.usage" }
  }
  const responseUsage = readPath(record, "response.usage")
  if (responseUsage && typeof responseUsage === "object") {
    return { value: responseUsage as Record<string, unknown>, modeHint: "per_turn", sourcePath: "response.usage" }
  }
  const turnUsage = readPath(record, "turn.token_usage")
  if (turnUsage && typeof turnUsage === "object") {
    return { value: turnUsage as Record<string, unknown>, modeHint: "per_turn", sourcePath: "turn.token_usage" }
  }
  return { value: undefined, modeHint: undefined }
}

function applyUsageSemantics(bucket: TokenBucket, value: Record<string, unknown>, sourcePath?: string): void {
  const path = sourcePath ?? ""
  if (/last_token_usage|total_token_usage|token_count|turn\.token_usage/.test(path)) {
    bucket.inputTokensMeaning = "total_input_including_cached"
    bucket.cachedInputMeaning = "subset_of_input"
  }
  if (hasNumericPath(value, "input_tokens_details.cached_tokens") || hasNumericPath(value, "prompt_tokens_details.cached_tokens")) {
    bucket.inputTokensMeaning = "total_input_including_cached"
    bucket.cachedInputMeaning = "subset_of_input"
  }
  if (hasNumericPath(value, "cached_input") || hasNumericPath(value, "cached_input_tokens")) {
    bucket.inputTokensMeaning = bucket.inputTokensMeaning === "unknown" ? "total_input_including_cached" : bucket.inputTokensMeaning
    bucket.cachedInputMeaning = bucket.cachedInputMeaning === "unknown" ? "subset_of_input" : bucket.cachedInputMeaning
  }
}

function tokenTypeFromRecord(record: Record<string, unknown>): string | undefined {
  return [
    record.token_type,
    record.tokenType,
    record.type,
    readPath(record, "payload.token_type"),
    readPath(record, "payload.tokenType"),
    readPath(record, "attributes.type"),
    readPath(record, "attributes.token_type"),
  ].map(asString).find(Boolean)
}

function valueFromMetricRecord(record: Record<string, unknown>): number | undefined {
  const candidates = [
    record.value,
    record.count,
    record.sum,
    readPath(record, "payload.value"),
    readPath(record, "metric.value"),
    readPath(record, "attributes.value"),
  ]
  return candidates.map(asNumber).find((value) => value !== undefined)
}

function addTypedMetric(bucket: TokenBucket, record: Record<string, unknown>): boolean {
  const tokenType = tokenTypeFromRecord(record)
  const value = valueFromMetricRecord(record)
  if (!tokenType || value === undefined) return false
  const normalized = normalizeFieldName(tokenType)
  const hit = { key: tokenType, path: `token_type:${tokenType}`, value }
  if (normalized === "input") addField(bucket, "inputTokens", hit)
  else if (normalized === "output" || normalized === "reasoningoutput") addField(bucket, "outputTokens", hit)
  else if (normalized === "cacheread" || normalized === "cachedinput") addField(bucket, "cacheReadTokens", hit)
  else if (normalized === "cachecreation" || normalized === "cachewrite") addField(bucket, "cacheCreationTokens", hit)
  else if (normalized === "total") addField(bucket, "totalTokens", hit)
  else return false
  return true
}

function tokenCountPayload(record: Record<string, unknown>): Record<string, unknown> | undefined {
  const payload = record.payload && typeof record.payload === "object" ? record.payload as Record<string, unknown> : undefined
  const type = [record.type, payload?.type, record.event, record.event_msg].map(asString).join(" ")
  const preferred = preferredUsagePayload(record)
  if (!/token_count|token usage|token_usage/.test(type) && !preferred.value) return undefined
  return preferred.value ?? record
}

function simpleBucketFromValue(value: unknown, sourcePath?: string): TokenBucket {
  const bucket = emptyBucket()
  const hits: FieldHit[] = []
  walkNumericFields(value, hits)
  for (const hit of hits) {
    const canonical = canonicalTokenField(hit)
    if (canonical) addField(bucket, canonical, hit)
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    applyUsageSemantics(bucket, value as Record<string, unknown>, sourcePath)
  }
  return bucket
}

function isNonDecreasingSequence(values: number[]): boolean {
  if (values.length < 2) return false
  return values.every((value, index) => index === 0 || value >= values[index - 1])
}

function aggregateCodexTokenCounts(records: Array<Record<string, unknown>>): TokenBucket {
  const aggregate = emptyBucket()
  const groups = new Map<string, Array<{ index: number; bucket: TokenBucket }>>()
  const seenRows = new Set<string>()
  records.forEach((record, index) => {
    const preferred = preferredUsagePayload(record)
    const payload = preferred.value
    if (!payload) return
    const bucket = simpleBucketFromValue(payload, preferred.sourcePath)
    if (bucket.fields.size === 0) return
    const sessionId = candidateSessionId(record, "unknown")
    const model = Array.from(bucket.models)[0] ?? asString(readPath(record, "payload.info.model")) ?? asString(readPath(record, "payload.turn_context.model")) ?? asString(readPath(record, "turn_context.model")) ?? asString(record.model) ?? "unknown"
    const timestamp = asString(record.timestamp) ?? String(index)
    const rowKey = `${sessionId}:${model}:${timestamp}:${bucket.inputTokens}:${bucket.outputTokens}:${bucket.cacheReadTokens}:${bucket.cacheCreationTokens}:${bucket.cacheWriteTokens}:${preferred.sourcePath ?? "usage"}`
    if (seenRows.has(rowKey)) {
      aggregate.duplicateEvents += 1
      return
    }
    seenRows.add(rowKey)
    bucket.tokenEventMode = preferred.modeHint ?? "none"
    const key = `${sessionId}:${model}`
    const items = groups.get(key) ?? []
    items.push({ index, bucket })
    groups.set(key, items)
  })

  for (const items of groups.values()) {
    items.sort((a, b) => a.index - b.index)
    const fieldNames: NumericTokenBucketKey[] = [
      "inputTokens",
      "outputTokens",
      "totalTokens",
      "cacheReadTokens",
      "cacheCreationTokens",
      "cacheWriteTokens",
      "cachedInputTokens",
    ]
    const modeHints = new Set(items.map((item) => item.bucket.tokenEventMode).filter((mode) => mode && mode !== "none"))
    const cumulative = modeHints.has("per_turn")
      ? false
      : modeHints.has("cumulative")
        ? true
        : fieldNames.some((field) => isNonDecreasingSequence(items.map((item) => item.bucket[field]).filter((value) => value > 0)))
    aggregate.tokenEventMode = aggregate.tokenEventMode === "none"
      ? (cumulative ? "cumulative" : "per_turn")
      : aggregate.tokenEventMode === (cumulative ? "cumulative" : "per_turn")
        ? aggregate.tokenEventMode
        : "mixed"
    const previous = emptyBucket()
    for (const [itemIndex, item] of items.entries()) {
      let rowInput = 0
      let rowOutput = 0
      let rowCacheRead = 0
      let rowCacheWrite = 0
      for (const field of fieldNames) {
        const raw = item.bucket[field]
        if (raw <= 0) continue
        const value = cumulative ? (itemIndex === 0 ? 0 : Math.max(0, raw - previous[field])) : raw
        aggregate[field] += value
        if (field === "inputTokens") rowInput += value
        if (field === "outputTokens") rowOutput += value
        if (field === "cacheReadTokens" || field === "cachedInputTokens") rowCacheRead += value
        if (field === "cacheCreationTokens" || field === "cacheWriteTokens") rowCacheWrite += value
        previous[field] = raw
      }
      for (const field of item.bucket.fields) aggregate.fields.add(`${field}${cumulative ? " (delta)" : ""}`)
      if (item.bucket.inputTokensMeaning !== "unknown") aggregate.inputTokensMeaning = item.bucket.inputTokensMeaning
      if (item.bucket.cachedInputMeaning !== "unknown") aggregate.cachedInputMeaning = item.bucket.cachedInputMeaning
      aggregate.normalizedRows.push(`mode=${cumulative ? "cumulative-delta" : "per-turn"} input=${rowInput} cache_read=${rowCacheRead} output=${rowOutput} cache_write=${rowCacheWrite}`)
    }
  }
  return aggregate
}

function aggregateTelemetry(
  provider: LocalAgentProvider,
  type: CandidateType,
  records: Array<Record<string, unknown>>,
  eventTypes: Set<string>
): NormalizedAgentTelemetry {
  const generic = emptyBucket()
  const codexTokenCounts = provider === "codex" ? aggregateCodexTokenCounts(records) : emptyBucket()
  const seenRequestKeys = new Set<string>()

  for (const record of records) {
    collectModels(record, generic.models)
    const eventName = [
      record.type,
      record.event,
      record.eventType,
      readPath(record, "payload.type"),
      readPath(record, "name"),
      readPath(record, "metric.name"),
    ].map(asString).filter(Boolean).join(" ")
    if (/error|exception|failed/i.test(eventName)) generic.errorCount += 1
    if (/api_request|response\.completed|request|run|token_count/i.test(eventName)) {
      const key = `${candidateSessionId(record, "unknown")}:${asString(record.request_id) ?? ""}:${asString(record.model) ?? ""}:${asString(record.timestamp) ?? ""}`
      if (!seenRequestKeys.has(key)) {
        seenRequestKeys.add(key)
        generic.requestCount += 1
      }
    }
    if (/claude_code\.token\.usage|token\.usage|metric/i.test(eventName)) {
      addTypedMetric(generic, record)
    }
    if (provider === "codex" && tokenCountPayload(record)) continue
    const hits: FieldHit[] = []
    walkNumericFields(record, hits)
    for (const hit of hits) {
      const canonical = canonicalTokenField(hit)
      if (canonical) {
        addField(generic, canonical, hit)
        const normalizedPath = normalizeFieldName(hit.path)
        if (/inputtokensdetailscachedtokens|prompttokensdetailscachedtokens/.test(normalizedPath)) {
          generic.inputTokensMeaning = "total_input_including_cached"
          generic.cachedInputMeaning = "subset_of_input"
        } else if (/cachereadtokens|cachecreationtokens|cachewritetokens/.test(normalizedPath)) {
          generic.inputTokensMeaning = generic.inputTokensMeaning === "unknown" ? "uncached_only" : generic.inputTokensMeaning
          generic.cachedInputMeaning = generic.cachedInputMeaning === "unknown" ? "separate_cache_read" : generic.cachedInputMeaning
        }
      }
    }
  }

  for (const field of ["inputTokens", "outputTokens", "totalTokens", "cacheReadTokens", "cacheCreationTokens", "cacheWriteTokens", "cachedInputTokens"] as const) {
    generic[field] += codexTokenCounts[field]
  }
  for (const field of codexTokenCounts.fields) generic.fields.add(field)
  if (codexTokenCounts.inputTokensMeaning !== "unknown") generic.inputTokensMeaning = codexTokenCounts.inputTokensMeaning
  if (codexTokenCounts.cachedInputMeaning !== "unknown") generic.cachedInputMeaning = codexTokenCounts.cachedInputMeaning
  generic.duplicateEvents += codexTokenCounts.duplicateEvents
  generic.normalizedRows.push(...codexTokenCounts.normalizedRows)
  if (codexTokenCounts.tokenEventMode && codexTokenCounts.tokenEventMode !== "none") generic.tokenEventMode = codexTokenCounts.tokenEventMode

  const cacheReadTokens = generic.cacheReadTokens + generic.cachedInputTokens
  const cacheWriteTokens = generic.cacheWriteTokens + generic.cacheCreationTokens
  const fields = Array.from(generic.fields)
  const hasTokenTelemetry = generic.inputTokens > 0 || generic.outputTokens > 0 || generic.totalTokens > 0 || fields.some((field) => /inputTokens|outputTokens|totalTokens/.test(field))
  const hasCacheTelemetry = fields.some((field) => /cacheReadTokens|cachedInputTokens|cacheCreationTokens|cacheWriteTokens/.test(field))
  const source = telemetrySource(provider, type, eventTypes)
  const inputBasis = hasCacheTelemetry
    ? generic.cachedInputMeaning === "subset_of_input"
      ? generic.inputTokens
      : generic.cachedInputMeaning === "separate_cache_read"
        ? generic.inputTokens + cacheReadTokens + cacheWriteTokens
        : null
    : null
  const rawCacheReadRate = hasCacheTelemetry && inputBasis && inputBasis > 0 ? cacheReadTokens / inputBasis : null
  const cacheReadRate = rawCacheReadRate !== null && rawCacheReadRate >= 0 && rawCacheReadRate <= 1 ? rawCacheReadRate : null
  const visibility: AgentTelemetryVisibility = hasCacheTelemetry && cacheReadRate !== null
    ? "exact_cache_telemetry"
    : hasTokenTelemetry || hasCacheTelemetry
      ? "token_telemetry_only"
      : "unavailable"
  const notes = fields.slice(0, 12)
  if (visibility === "token_telemetry_only" && !hasCacheTelemetry) notes.push("Token totals were explicit, but no cache-read/cache-creation fields were observed.")
  if (visibility === "exact_cache_telemetry" && cacheReadRate !== null) notes.push(`Cache-read rate uses explicit cache token fields only; cached input semantics: ${generic.cachedInputMeaning}.`)
  if (hasCacheTelemetry && rawCacheReadRate !== null && rawCacheReadRate > 1) notes.push(`Cache token fields were found, but cache-read tokens exceed the eligible denominator (${cacheReadTokens}/${inputBasis}); cache-read percent is suppressed.`)
  else if (hasCacheTelemetry && cacheReadRate === null) notes.push("Cache token fields were found, but input/cache denominator semantics are unclear; cache-read percent is suppressed.")
  if (generic.tokenEventMode && generic.tokenEventMode !== "none") notes.push(`Token event aggregation mode: ${generic.tokenEventMode}.`)
  if (generic.duplicateEvents > 0) notes.push(`Duplicate token event rows skipped: ${generic.duplicateEvents}.`)
  for (const row of generic.normalizedRows.slice(0, 5)) notes.push(`Normalized token row: ${row}.`)

  return {
    agent: provider,
    source,
    visibility,
    sessions: 1,
    runs: Math.max(1, generic.requestCount),
    modelCounts: Array.from(generic.models).reduce<Record<string, number>>((acc, model) => {
      acc[model] = (acc[model] ?? 0) + 1
      return acc
    }, {}),
    toolCalls: records.filter((record) => /tool|function_call/i.test([record.type, record.event, readPath(record, "payload.type")].map(asString).join(" "))).length,
    subagentRuns: records.filter((record) => /subagent/i.test(JSON.stringify(record).slice(0, 2000))).length,
    inputTokens: generic.inputTokens,
    outputTokens: generic.outputTokens,
    totalTokens: generic.totalTokens || generic.inputTokens + generic.outputTokens + cacheReadTokens + cacheWriteTokens,
    cacheReadTokens,
    cacheCreationTokens: generic.cacheCreationTokens,
    cacheWriteTokens,
    cachedInputTokens: generic.cachedInputTokens,
    uncachedInputTokens: Math.max(0, generic.inputTokens - generic.cachedInputTokens),
    costUsd: generic.costUsd > 0 ? Number(generic.costUsd.toFixed(6)) : null,
    requestCount: generic.requestCount,
    errorCount: generic.errorCount,
    cacheReadRate,
    cacheReadDenominatorTokens: cacheReadRate === null ? null : inputBasis,
    inputTokensMeaning: generic.inputTokensMeaning,
    cachedInputMeaning: generic.cachedInputMeaning,
    telemetryConfidence: visibility === "exact_cache_telemetry" ? "high" : visibility === "token_telemetry_only" && hasCacheTelemetry ? "low" : visibility === "token_telemetry_only" ? "medium" : "low",
    confidenceNotes: notes,
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
  const records = parsed.objects.filter((obj): obj is Record<string, unknown> => Boolean(obj && typeof obj === "object" && !Array.isArray(obj)))
  const textParts: string[] = []
  const models = new Set<string>()
  const eventTypes = new Set<string>()
  const topLevelKeys = new Set<string>()
  let projectPath: string | undefined
  let subagent: string | undefined
  let toolCalls = 0

  for (const record of records) {
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
      projectPath ??= asString(payload?.cwd)
    } else if (provider === "codex") {
      textParts.push(...parseCodexRecord(record))
      projectPath ??= asString(payload?.cwd)
      subagent ??= codexSubagentName(payload)
    } else {
      textParts.push(...parseOpenCodeRecord(record))
    }
  }

  const telemetry = aggregateTelemetry(provider, type, records, eventTypes)

  const text = redactText(textParts.filter(Boolean).join("\n"), redact)
  if (!text.trim() && telemetry.visibility === "unavailable") {
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
    toolCalls: toolCalls + telemetry.toolCalls,
    telemetry,
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

function normalizeProjectPath(path: string | undefined): string | undefined {
  if (typeof path !== "string") return undefined
  const trimmed = path.trim()
  if (!trimmed || trimmed === "unknown") return undefined
  try {
    return resolve(trimmed)
  } catch {
    return undefined
  }
}

function inferClaudeProjectPath(rootPath: string, filePath: string): string | undefined {
  const projectsMarker = `${sep}.claude${sep}projects`
  if (!rootPath.includes(projectsMarker) && !rootPath.endsWith(`${sep}projects`)) return undefined
  if (!filePath.startsWith(rootPath + sep) && filePath !== rootPath) return undefined
  const after = filePath.slice(rootPath.length).replace(new RegExp(`^\\${sep}+`), "")
  if (!after) return undefined
  // Claude Code's storage layout is `~/.claude/projects/<encoded-absolute-path>/<file>`.
  // The encoded segment is a stable per-project identifier; it is NOT a real
  // path on disk we can resolve, so we keep the full bucket path verbatim as
  // the project key. resolve() is deliberately avoided here.
  const bucket = dirname(join(rootPath, after))
  if (!bucket || bucket === rootPath) return undefined
  return bucket
}

function markdownStatus(projectRoot: string | undefined, filename: "AGENTS.md" | "CLAUDE.md"): MarkdownStatus {
  if (!projectRoot) return "unknown"
  const path = resolve(projectRoot, filename)
  if (!existsSync(path)) return "missing"
  try {
    const text = readFileSync(path, "utf-8")
    const tokens = approximateTokens(text)
    if (tokens < 30 && text.trim().length < 120) return "weak"
    const hasStructure = /^(#{1,3}\s|-{2,}|\*\s|\d+\.\s)/m.test(text)
    const mentionsStableUsage = /rules|instructions|layout|testing|commands|architecture|repo|project|context/i.test(text)
    if (!hasStructure && !mentionsStableUsage) return "weak"
    return "present"
  } catch {
    return "unknown"
  }
}

function projectAdvice(path: string, cacheReadPercent: number | null, sessions = 0): {
  agentsMdStatus: MarkdownStatus
  claudeMdStatus: MarkdownStatus
  hasAgentsMd?: boolean
  hasClaudeMd?: boolean
  advice: string[]
  fixAdvice: FixAdvice
} {
  const normalizedPath = normalizeProjectPath(path)
  const agentsMdStatus = markdownStatus(normalizedPath, "AGENTS.md")
  const claudeMdStatus = markdownStatus(normalizedPath, "CLAUDE.md")
  const hasAgentsMd = agentsMdStatus === "present" || agentsMdStatus === "weak"
  const hasClaudeMd = claudeMdStatus === "present" || claudeMdStatus === "weak"
  const advice: string[] = []
  if (agentsMdStatus === "missing") advice.push("Add AGENTS.md so Codex/OpenCode can start from stable repo rules instead of replaying ad hoc context.")
  if (agentsMdStatus === "weak") advice.push("Expand AGENTS.md so it carries stable repo rules, commands, architecture boundaries, and testing expectations.")
  if (claudeMdStatus === "missing") advice.push("Add CLAUDE.md or point Claude Code to AGENTS.md so Claude sessions get the same stable prefix.")
  if (claudeMdStatus === "weak") advice.push("Expand CLAUDE.md or make it clearly delegate to AGENTS.md so Claude sessions inherit the same stable repo rules.")
  if (cacheReadPercent !== null && cacheReadPercent < 0.35) advice.push("Cache-read is low for this project; move logs, diffs, terminal output, and task-specific notes below stable repo instructions.")
  if (advice.length === 0) advice.push("Keep repo instruction files stable. Avoid timestamps, sprint notes, and current-task state in the stable files.")
  const fixAdvice = adviceForLocalProjectFn({
    projectPath: normalizedPath ?? path,
    agentsMdStatus,
    claudeMdStatus,
    cacheReadPercent,
    sessions,
  })
  return { agentsMdStatus, claudeMdStatus, hasAgentsMd, hasClaudeMd, advice, fixAdvice }
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
          cachedInputTokens: cacheReadTokens,
          cacheCreationTokens: cacheWriteTokens,
          costUsd: typeof row.cost === "number" ? row.cost : Number(row.cost ?? 0),
          tokenAccounting: "observed" as const,
          hasTokenTelemetry: true,
          hasCacheTelemetry: true,
          cacheFieldPresent: true,
          costFieldPresent: row.cost !== undefined && row.cost !== null,
          cacheReadDenominatorTokens: inputTokens + cacheReadTokens + cacheWriteTokens,
          source: "local_db" as const,
          visibility: "exact_cache_telemetry" as const,
          confidenceNotes: ["OpenCode local database fields: tokens_input, tokens_output, tokens_cache_read, tokens_cache_write."],
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
  // The local report historically surfaces a separate `pricingKnown`
  // flag and per-agent `modelCostUsd`. We resolve through the
  // central `pricing.ts` registry so the price table stays in one
  // place, then map back to the local shape.
  const p = registryPricingForModel(rawName)
  if (!p) return undefined
  const confidence: Record<typeof p.source, Confidence> = {
    official: "medium",
    openrouter: "low",
    community: "low",
    estimate: "low",
  }
  return {
    normalizedName: p.family,
    provider: p.provider,
    inputUsdPerMTok: p.inputUsdPerMTok,
    pricingConfidence: confidence[p.source],
  }
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
        if (root.agent === "claude-code" && !parsed.projectPath) parsed.projectPath = inferClaudeProjectPath(root.path, file)
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
      if (parsed.telemetry && parsed.telemetry.visibility !== "unavailable") {
        const telemetry = parsed.telemetry
        sessions.push({
          agent: root.agent,
          path: file,
          startedAt: stat.mtime,
          text: parsed.text || telemetry.confidenceNotes.join("\n"),
          models: Array.from(new Set([...parsed.models, ...Object.keys(telemetry.modelCounts)])),
          parseWarnings: parsed.warnings,
          projectPath: parsed.projectPath,
          subagent: parsed.subagent,
          toolCalls: parsed.toolCalls ?? telemetry.toolCalls,
          metrics: {
            inputTokens: telemetry.inputTokens,
            outputTokens: telemetry.outputTokens,
            cacheReadTokens: telemetry.cacheReadTokens,
            cacheWriteTokens: telemetry.cacheWriteTokens,
            cachedInputTokens: telemetry.cachedInputTokens,
            cacheCreationTokens: telemetry.cacheCreationTokens,
            costUsd: telemetry.costUsd,
            tokenAccounting: "observed",
            hasTokenTelemetry: telemetry.visibility === "exact_cache_telemetry" || telemetry.visibility === "token_telemetry_only",
            hasCacheTelemetry: telemetry.visibility === "exact_cache_telemetry" && telemetry.cacheReadRate !== null,
            cacheFieldPresent: telemetry.visibility === "exact_cache_telemetry" || telemetry.cacheReadTokens > 0 || telemetry.cacheCreationTokens > 0 || telemetry.cacheWriteTokens > 0 || telemetry.cachedInputTokens > 0,
            costFieldPresent: telemetry.costUsd !== null,
            cacheReadDenominatorTokens: telemetry.cacheReadDenominatorTokens ?? null,
            source: telemetry.source,
            visibility: telemetry.visibility,
            confidenceNotes: telemetry.confidenceNotes,
          },
        })
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
          cachedInputTokens: 0,
          cacheCreationTokens: 0,
          costUsd: null,
          tokenAccounting: "estimated",
          hasTokenTelemetry: false,
          hasCacheTelemetry: false,
          cacheFieldPresent: false,
          costFieldPresent: false,
          cacheReadDenominatorTokens: null,
          source: "transcript",
          visibility: "transcript_context_only",
          confidenceNotes: ["Transcript/session text was parsed, but explicit token/cache telemetry fields were not observed."],
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
  if (sessions.length === 0) return undefined
  if (sessions.some((session) => session.metrics.tokenAccounting !== "observed")) return undefined
  if (sessions.some((session) => session.models.some((model) => !pricingForModel(model)?.inputUsdPerMTok))) return undefined
  const knownCostBasis = sessions.reduce((sum, session) => sum + (session.metrics.costUsd ?? 0), 0)
  if (knownCostBasis <= 0) return undefined
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
  const low = (avoidableTokens * blendedPerMTok * 0.35) / 1_000_000
  const high = (avoidableTokens * blendedPerMTok * 0.8) / 1_000_000
  const cappedHigh = Math.min(high, knownCostBasis)
  const cappedLow = Math.min(low, cappedHigh)
  return {
    low: Number(cappedLow.toFixed(2)),
    high: Number(cappedHigh.toFixed(2)),
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
  visibility: AgentTelemetryVisibility
} {
  const inputTokens = sessions.reduce((sum, session) => sum + session.metrics.inputTokens, 0)
  const outputTokens = sessions.reduce((sum, session) => sum + session.metrics.outputTokens, 0)
  const cacheReadTokens = sessions.reduce((sum, session) => sum + session.metrics.cacheReadTokens, 0)
  const cacheWriteTokens = sessions.reduce((sum, session) => sum + session.metrics.cacheWriteTokens, 0)
  const totalTokens = sessions.reduce((sum, session) => {
    const cacheTokensAreSeparate = session.metrics.cacheReadDenominatorTokens === session.metrics.inputTokens + session.metrics.cacheReadTokens + session.metrics.cacheWriteTokens
    return sum + session.metrics.inputTokens + session.metrics.outputTokens + session.metrics.cacheWriteTokens + (cacheTokensAreSeparate ? session.metrics.cacheReadTokens : 0)
  }, 0)
  const observedSessions = sessions.filter((session) => session.metrics.tokenAccounting === "observed")
  const validCacheSessions = observedSessions
    .filter((session) => session.metrics.hasCacheTelemetry && session.metrics.cacheReadDenominatorTokens !== null)
    .filter((session) => session.metrics.cacheReadTokens >= 0 && session.metrics.cacheReadTokens <= (session.metrics.cacheReadDenominatorTokens as number))
  const observedCacheReadTokens = validCacheSessions.reduce((sum, session) => sum + session.metrics.cacheReadTokens, 0)
  const denominatorValues = validCacheSessions.map((session) => session.metrics.cacheReadDenominatorTokens as number)
  const hasExactCacheTelemetry = validCacheSessions.length > 0
  const cacheDenominator = denominatorValues.reduce((sum, value) => sum + value, 0)
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
    cacheReadPercent: hasExactCacheTelemetry && cacheDenominator > 0 ? observedCacheReadTokens / cacheDenominator : null,
    modelCostUsd: costValues.length > 0 ? Number(costValues.reduce((sum, cost) => sum + cost, 0).toFixed(2)) : null,
    tokenAccounting:
      observed > 0 && estimated > 0
        ? "mixed"
        : observed > 0
          ? "observed"
          : estimated > 0
            ? "estimated"
            : "unavailable",
    visibility: sessions.some((session) => session.metrics.visibility === "exact_cache_telemetry")
      ? "exact_cache_telemetry"
      : sessions.some((session) => session.metrics.visibility === "token_telemetry_only")
        ? "token_telemetry_only"
        : sessions.some((session) => session.metrics.visibility === "transcript_context_only")
          ? "transcript_context_only"
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
    const projectPath = normalizeProjectPath(session.projectPath)
    if (!isReportableProjectPath(projectPath)) continue
    const existing = byPath.get(projectPath) ?? []
    existing.push(session)
    byPath.set(projectPath, existing)
  }

  const merged = new Map<string, LocalAgentReport["projects"][number]>()
  for (const [path, projectSessions] of byPath.entries()) {
    const stats = sessionStats(projectSessions)
    merged.set(path, {
      path,
      sessions: projectSessions.length,
      totalTokens: stats.totalTokens,
      cacheReadPercent: stats.cacheReadPercent,
      modelCostUsd: stats.modelCostUsd,
      ...projectAdvice(path, stats.cacheReadPercent, projectSessions.length),
    })
  }

  for (const project of fallbackProjects) {
    const path = normalizeProjectPath(project.path)
    if (!isReportableProjectPath(path)) continue
    const existing = merged.get(path)
    if (!existing) {
      merged.set(path, {
        ...project,
        path,
        ...projectAdvice(path, project.cacheReadPercent, project.sessions),
      })
      continue
    }
    merged.set(path, {
      ...existing,
      sessions: Math.max(existing.sessions, project.sessions),
      totalTokens: Math.max(existing.totalTokens, project.totalTokens),
      cacheReadPercent: existing.cacheReadPercent ?? project.cacheReadPercent,
      modelCostUsd: existing.modelCostUsd ?? project.modelCostUsd,
      ...projectAdvice(path, existing.cacheReadPercent ?? project.cacheReadPercent, Math.max(existing.sessions, project.sessions)),
    })
  }

  return Array.from(merged.values()).sort((a, b) => b.sessions - a.sessions || b.totalTokens - a.totalTokens || a.path.localeCompare(b.path))
}

function confidence(sessionsAnalyzed: number, modelCount: number, cashKnown: boolean): Confidence {
  if (sessionsAnalyzed >= 20 && modelCount > 0 && cashKnown) return "medium"
  if (sessionsAnalyzed >= 5 && modelCount > 0) return "medium"
  return "low"
}

function coverageForAgents(agents: LocalAgentReport["agents"], models: LocalAgentModelSummary[]): NonNullable<LocalAgentReport["summary"]["coverage"]> {
  const analyzed = agents.filter((agent) => agent.sessionsAnalyzed > 0)
  const coverage = <T,>(items: T[], predicate: (item: T) => boolean): "full" | "partial" | "unavailable" => {
    if (items.length === 0) return "unavailable"
    const count = items.filter(predicate).length
    if (count === 0) return "unavailable"
    return count === items.length ? "full" : "partial"
  }
  return {
    cacheTokenTelemetry: coverage(analyzed, (agent) => agent.cacheReadPercent !== null),
    costTelemetry: coverage(analyzed, (agent) => Boolean(agent.costFieldPresent)),
    pricingCoverage: models.length === 0 ? "unavailable" : models.every((model) => model.pricingKnown) ? "full" : models.some((model) => model.pricingKnown) ? "partial" : "unavailable",
    transcriptCoverage: coverage(analyzed, (agent) => agent.visibility === "transcript_context_only" || agent.tokenAccounting === "estimated"),
  }
}

function metricValue(
  value: number | null,
  unit: Metric<number | null>["unit"],
  telemetryKind: Metric<number | null>["telemetryKind"],
  confidenceValue: Metric<number | null>["confidence"],
  includedInGlobalTotal: boolean,
  notes?: string[]
): Metric<number | null> {
  return {
    value,
    unit,
    telemetryKind,
    confidence: confidenceValue,
    includedInGlobalTotal,
    notes,
  }
}

function agentMetricProvenance(agent: LocalAgentProvider, stats: ReturnType<typeof sessionStats>, sessions: LocalSession[]): Record<string, Metric<number | null>> {
  const sourceType = Array.from(new Set(sessions.map((session) => session.metrics.source))).join(", ") || "unavailable"
  const tokenKind = stats.tokenAccounting === "estimated" ? "estimated_from_transcript" : stats.tokenAccounting === "unavailable" ? "unavailable" : "observed_token_telemetry"
  const tokenConfidence = stats.tokenAccounting === "estimated" ? "low" : stats.tokenAccounting === "unavailable" ? "unavailable" : "high"
  const cacheKind = stats.cacheReadPercent === null ? "unavailable" : "observed_cache_telemetry"
  const cacheConfidence = stats.cacheReadPercent === null ? "unavailable" : "high"
  const costKind = stats.modelCostUsd === null ? "unavailable" : "observed_cost_telemetry"
  const costConfidence = stats.modelCostUsd === null ? "unavailable" : "medium"
  return {
    totalTokens: { ...metricValue(stats.totalTokens, "tokens", tokenKind, tokenConfidence, true), sourceAgent: agent, sourceFileOrSourceType: sourceType },
    inputTokens: { ...metricValue(stats.inputTokens, "tokens", tokenKind, tokenConfidence, true), sourceAgent: agent, sourceFileOrSourceType: sourceType },
    outputTokens: { ...metricValue(stats.outputTokens, "tokens", tokenKind, tokenConfidence, true), sourceAgent: agent, sourceFileOrSourceType: sourceType },
    cacheReadTokens: { ...metricValue(stats.cacheReadTokens, "tokens", cacheKind, cacheConfidence, stats.cacheReadPercent !== null), sourceAgent: agent, sourceFileOrSourceType: sourceType, exclusionReason: stats.cacheReadPercent === null ? "Cache field or denominator semantics not available." : undefined },
    cacheReadPercent: { ...metricValue(stats.cacheReadPercent, "percent", cacheKind, cacheConfidence, false), sourceAgent: agent, sourceFileOrSourceType: sourceType },
    modelCostUsd: { ...metricValue(stats.modelCostUsd, "usd", costKind, costConfidence, false), sourceAgent: agent, sourceFileOrSourceType: sourceType },
  }
}

export function validateLocalAgentReport(report: LocalAgentReport): string[] {
  const warnings: string[] = []
  const agentTokenTotal = report.agents.reduce((sum, agent) => sum + agent.totalTokens, 0)
  if (report.summary.totalTokens !== agentTokenTotal) warnings.push(`Global token total ${report.summary.totalTokens} does not equal agent token total ${agentTokenTotal}.`)
  if (report.summary.cacheReadPercent !== null && (report.summary.cacheReadPercent < 0 || report.summary.cacheReadPercent > 1)) warnings.push(`Global cache-read percent ${report.summary.cacheReadPercent} is outside 0-100%.`)
  for (const agent of report.agents) {
    if (agent.cacheReadPercent !== null && (agent.cacheReadPercent < 0 || agent.cacheReadPercent > 1)) warnings.push(`${agent.provider} cache-read percent ${agent.cacheReadPercent} is outside 0-100%.`)
  }
  if (report.agents.some((agent) => agent.cacheReadPercent === 0 && !agent.cacheFieldPresent)) warnings.push("Missing cache telemetry rendered as 0%.")
  const staleTelemetryFinding = report.findings.some((finding) => finding.id === "local-cache-telemetry-not-reported") && report.agents.filter((agent) => agent.sessionsAnalyzed > 0).every((agent) => agent.cacheFieldPresent)
  if (staleTelemetryFinding) warnings.push("Telemetry-not-reported finding is stale: all analyzed agents have cache fields.")
  const knownCost = report.summary.modelCostUsd ?? 0
  const recoveryHigh = report.summary.recoverableCashSaving?.high ?? 0
  if (recoveryHigh > knownCost && knownCost > 0) warnings.push(`Recoverable dollar estimate ${recoveryHigh} exceeds known cost basis ${knownCost}.`)
  if (report.summary.coverage?.pricingCoverage !== "full" && report.summary.recoverableCashSaving) warnings.push("Dollar recovery is shown with partial or unavailable pricing coverage.")
  for (const finding of report.findings) {
    if (!finding.evidence || finding.evidence.trim().length < 8) warnings.push(`Finding ${finding.id} has insufficient evidence.`)
  }
  return warnings
}

function finding(id: string, title: string, evidence: string, recommendation: string, severity: "low" | "medium" | "high", agent?: LocalAgentProvider): LocalAgentFinding {
  return { id, title, severity, agent, evidence, recommendation }
}

function invalidCacheTelemetryFinding(agent?: LocalAgentProvider): LocalAgentFinding {
  return finding(
    "invalid-cache-telemetry-semantics",
    "Cache telemetry denominator is not reliable",
    "Cache token fields were present, but cache-read tokens exceeded the eligible input denominator or the denominator semantics were unclear.",
    "Treat cache-read percent as not reported for these local files. Use provider/exported telemetry with explicit input-token denominator semantics before making cache-rate claims.",
    "medium",
    agent
  )
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
        visibility: "unavailable",
        coverage: {
          cacheTokenTelemetry: "unavailable",
          costTelemetry: "unavailable",
          pricingCoverage: "unavailable",
          transcriptCoverage: "unavailable",
        },
        metrics: {},
        sanityWarnings: [],
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
        visibility: "unavailable",
        telemetrySources: [],
        telemetryConfidence: "low",
        confidenceNotes: [],
        cacheFieldPresent: false,
        costFieldPresent: false,
        metrics: {},
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

  const allModels = summarizeModels(sessions)
  const unknownModelCount = allModels.filter((m) => !m.pricingKnown).length
  const allSignals = signalsFor(sessions, unknownModelCount)
  const cash = cashRange(sessions, allSignals)
  const allStats = sessionStats(sessions)
  const rankedProjects = summarizeProjectsFromSessions(sessions, projects)
  const projectsMissingAgents = rankedProjects.filter((project) => project.agentsMdStatus === "missing")
  const projectsWithWeakAgents = rankedProjects.filter((project) => project.agentsMdStatus === "weak")
  const claudeProjectsMissingClaudeMd = rankedProjects.filter((project) => project.claudeMdStatus === "missing" && sessions.some((session) => session.agent === "claude-code" && normalizeProjectPath(session.projectPath) === project.path))
  const claudeProjectsWithWeakClaudeMd = rankedProjects.filter((project) => project.claudeMdStatus === "weak" && sessions.some((session) => session.agent === "claude-code" && normalizeProjectPath(session.projectPath) === project.path))
  const weakAgents = projectsMissingAgents.length > 0 || projectsWithWeakAgents.length > 0
  const weakClaude = claudeProjectsMissingClaudeMd.length > 0 || claudeProjectsWithWeakClaudeMd.length > 0
  const recs = recommendations(weakAgents, weakClaude, sessions.some((session) => session.agent === "claude-code"))
  const allScore = localScore(allStats, allSignals, weakAgents)
  const claudeSessionsInWeakProjects = sessions.filter((session) => session.agent === "claude-code" && [...claudeProjectsMissingClaudeMd, ...claudeProjectsWithWeakClaudeMd].some((project) => project.path === normalizeProjectPath(session.projectPath)))

  const globalFindings: LocalAgentFinding[] = []
  if (allSignals.dynamicEarly > 0) globalFindings.push(finding("dynamic-context-early", "Dynamic logs/diffs/tool output appear early", `${allSignals.dynamicEarly} parsed session(s) had volatile command output, timestamps, errors, or diffs near the beginning.`, "Move terminal output, logs, stack traces, and git diffs to the end of task context.", "high"))
  if (projectsMissingAgents.length > 0 || projectsWithWeakAgents.length > 0) {
    const evidenceParts: string[] = []
    if (projectsMissingAgents.length > 0) evidenceParts.push(`Missing in ${projectsMissingAgents.slice(0, 3).map((project) => project.path).join(", ")}`)
    if (projectsWithWeakAgents.length > 0) evidenceParts.push(`Present but too thin in ${projectsWithWeakAgents.slice(0, 3).map((project) => project.path).join(", ")}`)
    globalFindings.push(finding("weak-agents-md", "Missing or weak AGENTS.md", `${evidenceParts.join(". ")}.`, "Create or update AGENTS.md with stable repo rules, commands, architecture boundaries, and testing expectations in the affected projects.", "medium"))
  }
  if (weakClaude && claudeSessionsInWeakProjects.length > 0) {
    const evidenceParts: string[] = []
    if (claudeProjectsMissingClaudeMd.length > 0) evidenceParts.push(`Missing in ${claudeProjectsMissingClaudeMd.slice(0, 3).map((project) => project.path).join(", ")}`)
    if (claudeProjectsWithWeakClaudeMd.length > 0) evidenceParts.push(`Present but too thin in ${claudeProjectsWithWeakClaudeMd.slice(0, 3).map((project) => project.path).join(", ")}`)
    globalFindings.push(finding("weak-claude-md", "Missing or weak CLAUDE.md", `Claude Code sessions are affected. ${evidenceParts.join(". ")}. ${claudeSessionsInWeakProjects.length} session(s) affected.`, "Create or update CLAUDE.md or point it to AGENTS.md in affected projects.", "low", "claude-code"))
  }
  if (allSignals.repeatedContext > 0) globalFindings.push(finding("repeated-project-context", "Repeated stable project context across sessions", `${allSignals.repeatedContext} parsed session(s) repeated stable project instructions that could live in markdown files.`, "Move stable project context into AGENTS.md and/or CLAUDE.md.", "medium"))
  if ((["claude-code", "codex"] as LocalAgentProvider[]).some((agent) => {
    const agentSessions = sessions.filter((session) => session.agent === agent)
    return agentSessions.length > 0 && !agentSessions.some((session) => session.metrics.cacheFieldPresent)
  })) {
    globalFindings.push(finding("local-cache-telemetry-not-reported", "Some local agents do not report cache telemetry", "Codex/Claude local transcript files parsed by Cachecatch do not expose cache-read/cache-write token fields, so their cache percentage is shown as not reported instead of guessed.", "This is a local telemetry visibility limitation, not proof that you used the agent incorrectly. Use the context-structure findings below to fix behavior that is actually visible.", "low"))
  }
  if (sessions.some((session) => session.metrics.cacheFieldPresent && !session.metrics.hasCacheTelemetry)) {
    globalFindings.push(invalidCacheTelemetryFinding())
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

    const agentFindingsList: LocalAgentFinding[] = []
    if (agentSessions.length > 0) {
      if (agentSignals.dynamicEarly > 0) agentFindingsList.push(finding("dynamic-context-early", "Dynamic logs/diffs/tool output appear early", `${agentSignals.dynamicEarly} parsed session(s) had volatile command output, timestamps, errors, or diffs near the beginning.`, "Move terminal output, logs, stack traces, and git diffs to the end of task context.", "high"))
      if (agentWeak) {
        if (agent === "claude-code") {
          const agentClaudeProjects = [...claudeProjectsMissingClaudeMd, ...claudeProjectsWithWeakClaudeMd].filter((project) => agentSessions.some((session) => normalizeProjectPath(session.projectPath) === project.path))
          if (agentClaudeProjects.length > 0) {
            const projectPaths = agentClaudeProjects.slice(0, 3).map((p) => p.path).join(", ")
            agentFindingsList.push(finding("weak-claude-md", "Missing or weak CLAUDE.md", `Claude Code sessions in ${projectPaths} are missing CLAUDE.md or the file is too thin to carry stable repo rules.`, "Create or update CLAUDE.md or point it to AGENTS.md in affected projects.", "low", "claude-code"))
          }
        } else {
          const relevantProjects = rankedProjects.filter((project) => (project.agentsMdStatus === "missing" || project.agentsMdStatus === "weak") && agentSessions.some((session) => normalizeProjectPath(session.projectPath) === project.path))
          if (relevantProjects.length > 0) {
            const projectPaths = relevantProjects.slice(0, 3).map((project) => project.path).join(", ")
            agentFindingsList.push(finding("weak-agents-md", "Missing or weak AGENTS.md", `Parsed sessions in ${projectPaths} are missing AGENTS.md or the file is too thin to carry stable repo rules.`, "Create or update AGENTS.md with stable repo rules and commands in affected projects.", "medium"))
          }
        }
      }
      if (agentSignals.repeatedContext > 0) agentFindingsList.push(finding("repeated-project-context", "Repeated stable project context across sessions", `${agentSignals.repeatedContext} parsed session(s) repeated stable project instructions that could live in markdown files.`, "Move stable project context into AGENTS.md and/or CLAUDE.md.", "medium"))
      if (agent !== "opencode" && !agentSessions.some((session) => session.metrics.cacheFieldPresent)) {
        agentFindingsList.push(finding("local-cache-telemetry-not-reported", "Some local agents do not report cache telemetry", "Codex/Claude local transcript files parsed by Cachecatch do not expose cache-read/cache-write token fields, so their cache percentage is shown as not reported instead of guessed.", "This is a local telemetry visibility limitation, not proof that you used the agent incorrectly. Use the context-structure findings below to fix behavior that is actually visible.", "low"))
      }
      if (agentSessions.some((session) => session.metrics.cacheFieldPresent && !session.metrics.hasCacheTelemetry)) {
        agentFindingsList.push(invalidCacheTelemetryFinding(agent))
      }
      if (agentSignals.unknownPricing > 0) agentFindingsList.push(finding("unknown-model-pricing", "Unknown model pricing", `${agentSignals.unknownPricing} detected model name(s) did not match Cachecatch's built-in pricing registry.`, "Keep token/cache percentages, but treat dollar estimates as partial until the pricing map covers those exact model strings.", "low"))
    }

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
      visibility: agentStats.visibility,
      telemetrySources: Array.from(new Set(agentSessions.map((session) => session.metrics.source))),
      telemetryConfidence: (agentStats.visibility === "exact_cache_telemetry" ? "high" : agentStats.visibility === "token_telemetry_only" ? "medium" : "low") as Confidence,
      confidenceNotes: Array.from(new Set(agentSessions.flatMap((session) => session.metrics.confidenceNotes))).slice(0, 8),
      cacheFieldPresent: agentSessions.some((session) => session.metrics.cacheFieldPresent),
      costFieldPresent: agentSessions.some((session) => session.metrics.costFieldPresent),
      metrics: agentMetricProvenance(agent, agentStats, agentSessions),
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
            : agentFindingsList[0]?.title ?? "No major local context-cache breaker detected.",
      findings: agentFindingsList,
      recommendations: agentSessions.length > 0 ? recs : [],
    }
  })

  const totalToolCalls = activity.toolCalls + sessions.filter((session) => session.agent !== "opencode").reduce((sum, session) => sum + session.toolCalls, 0)
  const totalSubagentRuns = agents.reduce((sum, agent) => sum + agent.subagentRuns, 0)
  const summaryCashSaving = (() => {
    if (unknownModelCount > 0 || allStats.modelCostUsd === null) return null
    const summed = agents.reduce(
      (acc, agent) => {
        const saving = agent.recoverableCashSaving
        if (!saving) return acc
        return { low: acc.low + (saving.low ?? 0), high: acc.high + (saving.high ?? 0) }
      },
      { low: 0, high: 0 }
    )
    if (summed.low === 0 && summed.high === 0) return null
    const high = Math.min(summed.high, allStats.modelCostUsd)
    const low = Math.min(summed.low, high)
    return { low: Number(low.toFixed(2)), high: Number(high.toFixed(2)), currency: "USD" as const, label: "estimated" as const }
  })()
  const coverage = coverageForAgents(agents, allModels)

  const observedCacheAgents = Array.from(new Set(sessions.filter((session) => session.metrics.cacheFieldPresent).map((session) => session.agent)))
  const observedCacheLabel = observedCacheAgents.length > 0
    ? observedCacheAgents.map((agent) => agent === "claude-code" ? "Claude Code" : agent === "codex" ? "Codex" : "OpenCode").join(", ")
    : "local agents with visible cache telemetry"
  const cacheSentence = allStats.cacheReadPercent === null
    ? "Cache-read telemetry was not visible in the parsed local files."
    : `Observed ${observedCacheLabel} cache read is ${Math.round(allStats.cacheReadPercent * 100)}%.`
  const telemetrySentence = (["claude-code", "codex"] as LocalAgentProvider[]).some((agent) => {
    const agentSessions = sessions.filter((session) => session.agent === agent)
    return agentSessions.length > 0 && !agentSessions.some((session) => session.metrics.cacheFieldPresent)
  })
    ? " Local Claude/Codex cache telemetry is not visible, so those agents are not counted as 0%."
    : ""

  const report: LocalAgentReport = {
    reportType: "local-agent-context-audit",
    generatedAt: (options.now ?? new Date()).toISOString(),
    window: options.window,
    summary: {
      status: "Parsed local sessions.",
      cacheLeakScore: allScore,
      recoverableCashSaving: summaryCashSaving,
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
      visibility: allStats.visibility,
      coverage,
      metrics: {
        totalTokens: metricValue(allStats.totalTokens, "tokens", allStats.tokenAccounting === "estimated" ? "estimated_from_transcript" : "observed_token_telemetry", allStats.tokenAccounting === "estimated" ? "low" : "high", true),
        inputTokens: metricValue(allStats.inputTokens, "tokens", allStats.tokenAccounting === "estimated" ? "estimated_from_transcript" : "observed_token_telemetry", allStats.tokenAccounting === "estimated" ? "low" : "high", true),
        outputTokens: metricValue(allStats.outputTokens, "tokens", allStats.tokenAccounting === "estimated" ? "estimated_from_transcript" : "observed_token_telemetry", allStats.tokenAccounting === "estimated" ? "low" : "high", true),
        cacheReadPercent: metricValue(allStats.cacheReadPercent, "percent", allStats.cacheReadPercent === null ? "unavailable" : "observed_cache_telemetry", allStats.cacheReadPercent === null ? "unavailable" : "high", false),
        modelCostUsd: metricValue(allStats.modelCostUsd, "usd", allStats.modelCostUsd === null ? "unavailable" : "observed_cost_telemetry", allStats.modelCostUsd === null ? "unavailable" : "medium", false),
        recoverableCashSavingHigh: metricValue(summaryCashSaving?.high ?? null, "usd", summaryCashSaving ? "inferred" : "unavailable", summaryCashSaving ? "medium" : "unavailable", false, summaryCashSaving ? ["Capped to known model-cost basis."] : ["Suppressed because cost/pricing coverage is partial or unavailable."]),
      },
      toolCalls: totalToolCalls,
      subagentRuns: totalSubagentRuns,
      modelsDetected: allModels.filter((m) => m.rawName !== "unknown" && m.rawName !== "<synthetic>").length,
      confidence: confidence(sessions.length, allModels.length, Boolean(cash)),
      mainFinding: `Cachecatch analyzed ${sessions.length.toLocaleString("en-US")} coding-agent sessions, ${allStats.totalTokens.toLocaleString("en-US")} token activity, ${totalToolCalls.toLocaleString("en-US")} tool calls, and ${totalSubagentRuns.toLocaleString("en-US")} subagent runs. ${cacheSentence}${telemetrySentence}`,
    },
    agents,
    modelsDetected: allModels.filter((m) => m.rawName !== "unknown" && m.rawName !== "<synthetic>"),
    projects: rankedProjects,
    activity: {
      toolCalls: totalToolCalls,
      subagentRuns: totalSubagentRuns,
      topSubagents: activity.topSubagents,
    },
    findings: globalFindings,
    recommendations: recs,
    diagnostics,
    pricingDisclaimer: PRICING_DISCLAIMER,
  }
  report.summary.sanityWarnings = validateLocalAgentReport(report)
  if (report.summary.sanityWarnings.length > 0) {
    report.summary.confidence = "low"
    report.summary.recoverableCashSaving = null
  }
  return report
}

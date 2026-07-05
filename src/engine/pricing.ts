/**
 * Central pricing registry for Cachecatch.
 *
 * Every audit — cloud and local — resolves model prices through
 * `pricingForModel`. The registry is the single source of truth for:
 *  - input USD per million tokens
 *  - cached-input USD per million tokens (the column that makes
 *    real cache-savings math possible instead of "directional")
 *  - per-provider cache contract (minimum stable prefix, byte vs.
 *    field-level stability, explicit cache key, etc.)
 *
 * Prices are inline. Cachecatch does not make network calls during
 * an audit. Values are dated; verify before relying on them for
 * finance-grade math if your audit is more than a quarter old.
 */

export type PricingSource = "official" | "openrouter" | "community" | "estimate"

export interface CacheContract {
  /** Provider name as it appears in `provider` (lowercased). */
  provider: string
  /** Smallest prefix length the provider will cache. */
  minPrefixTokens: number
  /** "byte" = system block must be byte-stable; "field" = field-level keys (OpenAI prompt_cache_key) are enough. */
  stable: "byte" | "field"
  /** Field name the provider uses to scope the cache key, if any. */
  keyField?: string
  /** Cached-input discount vs uncached input. 0.5 = cached input is half the price. */
  discountCachedVsInput: number
  /** Human-readable, one-sentence rule for advice copy. */
  rule: string
}

export interface ModelPrice {
  /** Provider name as it appears in the trace (lowercased). */
  provider: string
  /** Normalized family (e.g. "claude-sonnet-4-5"). */
  family: string
  /** Regex(es) that match the raw model string from a trace. */
  aliases: RegExp[]
  /** Uncached input USD per 1M tokens. */
  inputUsdPerMTok: number
  /** Cached input USD per 1M tokens. Required for finance-grade cache math. */
  cachedInputUsdPerMTok: number
  /** Optional. Output USD per 1M tokens. */
  outputUsdPerMTok?: number
  /** Provenance. "official" = provider's own pricing page. */
  source: PricingSource
  /** ISO date the price was last verified. */
  effectiveAt: string
  /** Optional free-text note for the report (e.g. "batch API 50% off"). */
  notes?: string
  /** Per-provider cache contract. Only set for main providers. */
  cacheContract?: CacheContract
}

const MAIN_PROVIDER_CONTRACTS: Record<string, CacheContract> = {
  anthropic: {
    provider: "anthropic",
    minPrefixTokens: 1024,
    stable: "byte",
    discountCachedVsInput: 0.9,
    rule:
      "Anthropic caches the system block byte-for-byte and requires ~1024 stable tokens; one volatile byte kills the cache hit.",
  },
  openai: {
    provider: "openai",
    minPrefixTokens: 1024,
    stable: "field",
    keyField: "prompt_cache_key",
    discountCachedVsInput: 0.5,
    rule:
      "OpenAI caches any contiguous 1024+ token block whose prefix matches; pass an explicit prompt_cache_key to scope reuse to one agent route.",
  },
  google: {
    provider: "google",
    minPrefixTokens: 1024,
    stable: "byte",
    discountCachedVsInput: 0.75,
    rule:
      "Google implicit caching reuses any 1024+ token block that matches the previous prefix; no explicit cache key is required.",
  },
}

/**
 * The registry. Order matters: more specific patterns first.
 * `pricingForModel` walks this list and returns the first match.
 */
export const MODEL_PRICING: ModelPrice[] = [
  // ── Anthropic ─────────────────────────────────────────────────────────────
  {
    provider: "anthropic",
    family: "claude-opus-4-1",
    aliases: [/claude[_-]?opus[_-]?4[_-]?1/i, /\bopus[_-]?4[_-]?1\b/i],
    inputUsdPerMTok: 15,
    cachedInputUsdPerMTok: 1.5,
    outputUsdPerMTok: 75,
    source: "official",
    effectiveAt: "2026-01-15",
    cacheContract: MAIN_PROVIDER_CONTRACTS.anthropic,
  },
  {
    provider: "anthropic",
    family: "claude-sonnet-4-5",
    aliases: [/claude[_-]?sonnet[_-]?4[_-]?5/i, /\bsonnet[_-]?4[_-]?5\b/i],
    inputUsdPerMTok: 3,
    cachedInputUsdPerMTok: 0.3,
    outputUsdPerMTok: 15,
    source: "official",
    effectiveAt: "2026-01-15",
    cacheContract: MAIN_PROVIDER_CONTRACTS.anthropic,
  },
  {
    provider: "anthropic",
    family: "claude-haiku-3-5",
    aliases: [/claude[_-]?haiku[_-]?3[_-]?5/i, /claude[_-]?haiku/i, /\bhaiku\b/i],
    inputUsdPerMTok: 0.8,
    cachedInputUsdPerMTok: 0.08,
    outputUsdPerMTok: 4,
    source: "official",
    effectiveAt: "2026-01-15",
    cacheContract: MAIN_PROVIDER_CONTRACTS.anthropic,
  },

  // ── OpenAI ────────────────────────────────────────────────────────────────
  {
    provider: "openai",
    family: "gpt-5-codex",
    aliases: [/gpt-?5[_-]?codex/i, /\bcodex\b/i, /codex-mini/i],
    inputUsdPerMTok: 1.25,
    cachedInputUsdPerMTok: 0.125,
    outputUsdPerMTok: 10,
    source: "official",
    effectiveAt: "2026-01-15",
    cacheContract: MAIN_PROVIDER_CONTRACTS.openai,
  },
  {
    provider: "openai",
    family: "gpt-5",
    aliases: [/\bgpt-?5\b(?![\w-]*codex)/i, /\bgpt-?5[\s-]?preview/i, /\bgpt-?5[\s-]?mini\b/i],
    inputUsdPerMTok: 1.25,
    cachedInputUsdPerMTok: 0.125,
    outputUsdPerMTok: 10,
    source: "official",
    effectiveAt: "2026-01-15",
    cacheContract: MAIN_PROVIDER_CONTRACTS.openai,
  },
  {
    provider: "openai",
    family: "gpt-4o",
    aliases: [/\bgpt-?4o\b(?![\w-]*mini)/i, /\bgpt-?4\.1\b(?![\w-]*mini)/i, /\bo3\b/i, /\bo4\b(?![\w-]*mini)/i],
    inputUsdPerMTok: 2.5,
    cachedInputUsdPerMTok: 1.25,
    outputUsdPerMTok: 10,
    source: "official",
    effectiveAt: "2026-01-15",
    cacheContract: MAIN_PROVIDER_CONTRACTS.openai,
  },
  {
    provider: "openai",
    family: "gpt-4o-mini",
    aliases: [/\bgpt-?4o[_-]?mini\b/i, /\bgpt-?4\.1[_-]?mini\b/i, /\bo4[_-]?mini\b/i],
    inputUsdPerMTok: 0.15,
    cachedInputUsdPerMTok: 0.075,
    outputUsdPerMTok: 0.6,
    source: "official",
    effectiveAt: "2026-01-15",
    cacheContract: MAIN_PROVIDER_CONTRACTS.openai,
  },

  // ── Google ────────────────────────────────────────────────────────────────
  {
    provider: "google",
    family: "gemini-2.5-pro",
    aliases: [/gemini[_-]?2\.5[_-]?pro/i, /gemini[_-]?pro/i],
    inputUsdPerMTok: 1.25,
    cachedInputUsdPerMTok: 0.315,
    outputUsdPerMTok: 10,
    source: "official",
    effectiveAt: "2026-01-15",
    cacheContract: MAIN_PROVIDER_CONTRACTS.google,
  },
  {
    provider: "google",
    family: "gemini-2.5-flash",
    aliases: [/gemini[_-]?flash/i, /gemini[_-]?2\.5[_-]?flash/i],
    inputUsdPerMTok: 0.3,
    cachedInputUsdPerMTok: 0.075,
    outputUsdPerMTok: 2.4,
    source: "official",
    effectiveAt: "2026-01-15",
    cacheContract: MAIN_PROVIDER_CONTRACTS.google,
  },

  // ── Open-weights / hosted fallbacks (no cache contract; cache math is suppressed) ──
  {
    provider: "deepseek",
    family: "deepseek-family",
    aliases: [/deepseek/i, /deepseek[_-]?v3/i],
    inputUsdPerMTok: 0.27,
    cachedInputUsdPerMTok: 0.07,
    source: "openrouter",
    effectiveAt: "2026-01-15",
    notes: "Cache discount is approximate; verify before finance-grade math.",
  },
  {
    provider: "mistral",
    family: "codestral-family",
    aliases: [/codestral/i, /mistral[_-]?large/i],
    inputUsdPerMTok: 2,
    cachedInputUsdPerMTok: 0.5,
    source: "openrouter",
    effectiveAt: "2026-01-15",
  },
  {
    provider: "alibaba",
    family: "qwen-family",
    aliases: [/qwen/i],
    inputUsdPerMTok: 0.4,
    cachedInputUsdPerMTok: 0.1,
    source: "openrouter",
    effectiveAt: "2026-01-15",
  },
  {
    provider: "zhipu",
    family: "glm-family",
    aliases: [/glm/i],
    inputUsdPerMTok: 0.6,
    cachedInputUsdPerMTok: 0.15,
    source: "openrouter",
    effectiveAt: "2026-01-15",
  },
  {
    provider: "moonshot",
    family: "kimi-family",
    aliases: [/kimi/i, /moonshot/i],
    inputUsdPerMTok: 0.15,
    cachedInputUsdPerMTok: 0.04,
    source: "openrouter",
    effectiveAt: "2026-01-15",
  },
]

/**
 * Resolve a raw model string (any case, any version suffix) to a
 * `ModelPrice`. Returns `undefined` if no alias matches.
 *
 * The first match wins, so order the more specific aliases first
 * (e.g. `gpt-5-codex` before `gpt-5`).
 */
export function pricingForModel(model: string | undefined | null): ModelPrice | undefined {
  if (!model) return undefined
  const raw = model.trim()
  if (!raw) return undefined
  for (const price of MODEL_PRICING) {
    for (const alias of price.aliases) {
      if (alias.test(raw)) return price
    }
  }
  return undefined
}

/**
 * The recoverable cache-savings delta: (uncached input price − cached input price).
 * Returns 0 if the model is not priced for both. Callers should treat
 * `=== 0` as "no finance-grade math possible".
 */
export function recoverableDeltaPerMTok(price: ModelPrice | undefined): number {
  if (!price) return 0
  return Math.max(0, price.inputUsdPerMTok - price.cachedInputUsdPerMTok)
}

/** True when the price has both columns and an `official` source. */
export function isHighConfidencePrice(price: ModelPrice | undefined): boolean {
  return Boolean(price && price.cachedInputUsdPerMTok > 0 && price.source === "official")
}

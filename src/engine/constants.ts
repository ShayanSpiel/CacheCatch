import type { CacheBreakerType, Severity } from "../types/index.ts"

export const APP_NAME = "Cachecatch"
export const APP_TAGLINE = "Prompt CacheOps"
export const APP_DESCRIPTION =
  "Cachecatch audits LangSmith / Langfuse / Braintrust traces, detects prompt-cache breakers, estimates wasted spend, and gives exact fixes."
export const APP_VERSION = "0.4.0"
export const LANGSMITH_BASE_URL = "https://api.smith.langchain.com"

export const MAX_RUNS_FETCH = 300
export const DEFAULT_PRICE_PER_1K_TOKENS_USD = 0.003

export const WINDOW_LABELS: Record<string, string> = {
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
  "1y": "1 year",
}

export const PROVIDER_LABELS: Record<string, string> = {
  langsmith: "LangSmith",
  langfuse: "Langfuse",
  braintrust: "Braintrust",
  mock: "Mock",
  sample: "Sample",
}

export const CACHE_BREAKER_LABELS: Record<CacheBreakerType, string> = {
  early_dynamic_metadata: "Early Dynamic Metadata",
  timestamp_in_prefix: "Timestamp in Prefix",
  request_id_in_prefix: "Request ID in Prefix",
  tool_schema_drift: "Tool Schema Drift",
  rag_before_stable_context: "RAG Before Stable Context",
  dynamic_system_prompt: "Dynamic System Prompt",
  model_or_provider_drift: "Model/Provider Drift",
  missing_cache_telemetry: "Missing Cache Telemetry",
  observed_cache_read_low: "Observed Cache Read Low",
  estimated_cache_opportunity_high: "Large Estimated Cache Opportunity",
  unknown: "Unknown",
}

export const CACHE_BREAKER_SEVERITY: Record<CacheBreakerType, Severity> = {
  early_dynamic_metadata: "high",
  timestamp_in_prefix: "high",
  request_id_in_prefix: "medium",
  tool_schema_drift: "medium",
  rag_before_stable_context: "high",
  dynamic_system_prompt: "critical",
  model_or_provider_drift: "medium",
  missing_cache_telemetry: "low",
  observed_cache_read_low: "high",
  estimated_cache_opportunity_high: "medium",
  unknown: "low",
}

/** Maps a breaker type to a human-friendly tag for terminal output. */
export const BREAKER_TAG: Record<CacheBreakerType, string> = {
  early_dynamic_metadata: "EARLY-METADATA",
  timestamp_in_prefix: "TIMESTAMP",
  request_id_in_prefix: "REQUEST-ID",
  tool_schema_drift: "TOOL-DRIFT",
  rag_before_stable_context: "RAG-FIRST",
  dynamic_system_prompt: "DYNAMIC-SYSTEM",
  model_or_provider_drift: "MODEL-DRIFT",
  missing_cache_telemetry: "NO-TELEMETRY",
  observed_cache_read_low: "CACHE-LOW",
  estimated_cache_opportunity_high: "BIG-OPPORTUNITY",
  unknown: "UNKNOWN",
}

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

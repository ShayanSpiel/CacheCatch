/**
 * Re-export the new provider-agnostic engine so existing
 * `lib/cachecatch/*` imports keep working unchanged.
 *
 * The real implementation lives in `src/engine/*` and is the
 * source of truth shared between the web app and the CLI.
 */

export type {
  AuditWindow,
  CacheBreakerType,
  Severity,
  Confidence,
  FindingBasis,
  CacheFinding,
  RouteAudit,
  DataQuality,
  CachecatchReport,
} from "../../src/types"

// Use a deprecated alias to avoid name collision: the new types
// re-export NormalizedTrace; the legacy web app uses NormalizedRun.
import type { NormalizedTrace as _NormalizedTrace } from "../../src/types"
/** @deprecated use NormalizedTrace from src/types */
export type NormalizedRun = _NormalizedTrace

/** @deprecated tokens are now fields on NormalizedTrace.metrics */
export type TokenTelemetry = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
  rawInputTokenDetails?: Record<string, unknown>
  rawUsage?: Record<string, unknown>
}

export { CACHE_BREAKER_LABELS, CACHE_BREAKER_SEVERITY } from "../../src/engine/constants"
export { detectFindings } from "../../src/engine/detectors"
export { comparePrompts, approximateTokens } from "../../src/engine/prefix-matcher"
export {
  assessDataQuality,
  calculateReportConfidence,
  calculateScore,
} from "../../src/engine/scoring"
export { buildReport, annotateWaste } from "../../src/engine/report-builder"

export { sampleReport } from "./sample-data"

/**
 * Legacy shim — re-exports the new types from `src/types/*` so
 * existing web app imports (`from "@/lib/cachecatch/types"`)
 * keep working unchanged.
 *
 * The new types are the source of truth; this file just
 * preserves the import surface used by the original web app.
 */

export type {
  Provider,
  AuditWindow,
  CacheBreakerType,
  Severity,
  Confidence,
  FindingBasis,
  CacheFinding,
  RouteAudit,
  DataQuality,
  CachecatchRouteDiagnostic,
  CachecatchReportDetails,
  CachecatchReport,
} from "../../src/types/index.js"

// Legacy aliases — `NormalizedRun` and `TokenTelemetry` were
// renamed to `NormalizedTrace` and absorbed into the
// `NormalizedTrace.metrics` shape. The web app's existing UI
// components still expect these names, so we re-derive them
// from the new types.
import type { NormalizedTrace } from "../../src/types/index.js"

/** @deprecated use NormalizedTrace */
export type NormalizedRun = NormalizedTrace

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

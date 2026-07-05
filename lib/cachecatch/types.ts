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
  ReportMode,
  CacheFinding,
  RouteAudit,
  DataQuality,
  CachecatchRouteDiagnostic,
  CachecatchReportDetails,
  CachecatchReport,
  RoutePromptRebuild,
  FixAdvice,
} from "../../src/types/index.js"

// Legacy aliases — `NormalizedRun` was renamed to `NormalizedTrace`.
// The web app's existing UI components still expect this name.
import type { NormalizedTrace } from "../../src/types/index.js"

/** @deprecated use NormalizedTrace */
export type NormalizedRun = NormalizedTrace

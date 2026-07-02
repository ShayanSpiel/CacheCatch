/**
 * Legacy shim — delegates to the new engine. Kept as a re-export
 * so existing web app code (`from "@/lib/cachecatch/analyzer"`)
 * keeps working unchanged.
 */

import { buildReport } from "../../src/engine/report-builder"
import type { NormalizedRun, CachecatchReport, AuditWindow } from "./types"

export function analyzeRuns(
  runs: NormalizedRun[],
  projectName: string,
  projectUrl: string | undefined,
  window: AuditWindow
): CachecatchReport {
  return buildReport(runs, {
    projectName,
    projectUrl,
    window,
    source: "langsmith",
  })
}

/**
 * Legacy shim — wraps the new buildReport to keep the old
 * positional-argument API working for the web app.
 */

import { buildReport as newBuildReport } from "../../src/engine/report-builder"
import type {
  NormalizedRun,
  CachecatchReport,
  AuditWindow,
  Provider,
} from "./types"

export function buildReport(
  runs: NormalizedRun[],
  projectName: string,
  projectUrl: string | undefined,
  window: AuditWindow,
  source: Provider
): CachecatchReport {
  return newBuildReport(runs, {
    projectName,
    projectUrl,
    window,
    source,
  })
}

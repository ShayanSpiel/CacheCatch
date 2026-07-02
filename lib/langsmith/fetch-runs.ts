/** Legacy shim — fetch logic now lives in src/adapters/langsmith.ts */
import { langSmithAdapter } from "../../src/adapters/langsmith"
import { parseProjectUrl } from "./parse-project"
import type { NormalizedRun, AuditWindow } from "../cachecatch/types"

export async function fetchAndNormalizeRuns(
  apiKey: string,
  projectNameOrUrl: string,
  window: AuditWindow,
  baseUrl?: string
): Promise<{ runs: NormalizedRun[]; projectName: string; projectUrl?: string }> {
  const { projectName, projectUrl } = parseProjectUrl(projectNameOrUrl)
  const result = await langSmithAdapter.fetchTraces({
    project: projectName,
    apiKey,
    window,
    baseUrl,
  })
  return {
    runs: result.traces as NormalizedRun[],
    projectName: result.projectName,
    projectUrl: result.projectUrl ?? projectUrl,
  }
}

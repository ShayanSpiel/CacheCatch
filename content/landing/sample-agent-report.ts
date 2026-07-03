/**
 * Pre-rendered local-agent sample report for the landing page terminal demo.
 *
 * The renderers live in src/reporting/ — this file just calls them once
 * and exports the resulting HTML sections so page.tsx stays clean.
 */

import { sampleLocalReport } from "@/lib/cachecatch/sample-local-data"
import { ansiToHtml } from "@/src/reporting/ansi-html"
import { renderLocalAgentTerminalReport } from "@/src/reporting/local-terminal-report"
import { setTerminalWidth } from "@/src/reporting/terminal-report"

setTerminalWidth(104)

const raw = renderLocalAgentTerminalReport(sampleLocalReport)

export const agentReportSections: string[] = raw
  .split("\n\n")
  .filter((s) => s.trim())
  .map((section) => ansiToHtml(section))

export const agentReportPrompt = "npx cachecatch audit local --window 7d"

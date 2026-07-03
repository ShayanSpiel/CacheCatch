/**
 * Pre-rendered LangSmith (cloud) sample report for the landing page terminal demo.
 *
 * The renderers live in src/reporting/ — this file just calls them once
 * and exports the resulting HTML sections so page.tsx stays clean.
 */

import { sampleReport } from "@/lib/cachecatch/sample-data"
import { ansiToHtml } from "@/src/reporting/ansi-html"
import {
  renderCacheHealthScore,
  renderDataQuality,
  renderAgentRepairPrompt,
  renderExportCommands,
  renderFounderSummary,
  renderHeader,
  renderMoneyMath,
  renderOptimizedPromptStructure,
  renderPersonalizedFixPlan,
  renderRouteDiagnostics,
  renderTopLeaksTable,
  renderValidationPlan,
  setTerminalWidth,
} from "@/src/reporting/terminal-report"

setTerminalWidth(104)

const sections = [
  renderHeader(sampleReport),
  renderFounderSummary(sampleReport),
  renderOptimizedPromptStructure(sampleReport),
  renderMoneyMath(sampleReport),
  renderCacheHealthScore(sampleReport),
  renderTopLeaksTable(sampleReport, 4, false),
  renderRouteDiagnostics(sampleReport, false),
  renderPersonalizedFixPlan(sampleReport),
  renderAgentRepairPrompt(sampleReport),
  renderValidationPlan(sampleReport),
  renderDataQuality(sampleReport),
  renderExportCommands(sampleReport),
]

export const langsmithReportSections: string[] = sections.map((s) => ansiToHtml(s))

export const langsmithReportPrompt = "npx cachecatch audit local --window 7d"

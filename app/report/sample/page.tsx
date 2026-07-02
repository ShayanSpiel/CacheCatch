import { sampleReport } from "@/lib/cachecatch/sample-data"
import { ansiToHtml } from "@/src/reporting/ansi-html"
import {
  renderFounderSummary,
  renderHeader,
  renderMoneyMath,
  renderCacheHealthScore,
  renderTopLeaksTable,
  renderRouteDiagnostic,
} from "@/src/reporting/terminal-report"

const divider = "─".repeat(96)

export default function SampleReportPage() {
  const report = sampleReport
  const primaryRoute = report.details?.routeDiagnostics?.[0]
  const terminalText = [
    renderHeader(report),
    renderFounderSummary(report),
    renderMoneyMath(report),
    renderCacheHealthScore(report),
    renderTopLeaksTable(report, 6, false),
    primaryRoute
      ? renderRouteDiagnostic(
          primaryRoute,
          report.summary.estimatedMonthlyWasteUsd,
          report.dataQuality.hasCacheReadTelemetry
        )
      : "",
  ].join(`\n\n${divider}\n\n`)

  const terminalHtml = ansiToHtml(terminalText)

  return (
    <main className="min-h-screen bg-[#171717] px-4 py-6 text-[#d2d2d2] sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto max-w-[1520px]">
        <div className="border-t border-[#6e6e6e] pt-8">
          <div className="overflow-x-auto">
            <pre
              className="min-w-max font-mono text-[17px] leading-[1.36] tracking-[-0.01em] text-[#d2d2d2] [font-variant-ligatures:none] [text-rendering:optimizeLegibility] [white-space:break-spaces] sm:text-[18px]"
              dangerouslySetInnerHTML={{ __html: terminalHtml }}
            />
          </div>
        </div>
        <p className="mt-6 max-w-4xl font-mono text-[12px] leading-5 text-[#7a7a7a]">
          Summarized from the same sample data used by <span className="text-[#a9a9a9]">cachecatch sample</span>.
          The structure and styling now follow the CLI report directly.
        </p>
      </div>
    </main>
  )
}

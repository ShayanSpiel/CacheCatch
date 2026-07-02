"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { CopyButton } from "@/components/shared/copy-button"
import { useNotify } from "@/components/shared/notification-toast"
import { RiDownload2Line, RiArrowLeftLine } from "@/components/icons/remixicon"
import { renderHtmlReport } from "@/src/reporting/html-report"
import type { CachecatchReport } from "@/lib/cachecatch/types"

interface ReportActionsProps {
  report: CachecatchReport
  fixPlan: string[]
  cliCommand: string
}

function downloadBlob(content: string, type: string, filename: string): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function ReportActions({ report, fixPlan, cliCommand }: ReportActionsProps) {
  const notify = useNotify()
  const fixPlanText = fixPlan.map((p, i) => `${i + 1}. ${p}`).join("\n")

  const handleDownloadJson = () => {
    downloadBlob(
      JSON.stringify(report, null, 2),
      "application/json",
      "cachecatch-report.json"
    )
    notify("Report JSON downloaded")
  }

  const handleDownloadHtml = () => {
    downloadBlob(
      renderHtmlReport(report),
      "text/html",
      "cachecatch-report.html"
    )
    notify("Report HTML downloaded")
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <CopyButton text={fixPlanText} label="Copy fix plan" />
      <Button variant="outline" size="sm" onClick={handleDownloadJson}>
        <RiDownload2Line className="size-3.5" />
        Download JSON
      </Button>
      <Button variant="outline" size="sm" onClick={handleDownloadHtml}>
        <RiDownload2Line className="size-3.5" />
        Download HTML
      </Button>
      <CopyButton text={cliCommand} label="Copy CLI command" />
      <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
        <Link href="/">
          <RiArrowLeftLine className="size-3.5" />
          Back to audit
        </Link>
      </Button>
    </div>
  )
}

"use client"

import { useMemo } from "react"
import { useParams } from "next/navigation"
import { loadReportFromStorage } from "@/lib/storage/report-codec"
import { ReportShell } from "@/components/report/report-shell"
import { EmptyState } from "@/components/shared/empty-state"

export default function ReportPage() {
  const params = useParams()
  const id = params.id as string

  const report = useMemo(() => {
    if (typeof window === "undefined") return null
    return loadReportFromStorage(id)
  }, [id])

  if (!report) {
    return <EmptyState />
  }

  return <ReportShell report={report} />
}

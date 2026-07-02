import { CachecatchReport } from "@/lib/cachecatch/types"

const STORAGE_PREFIX = "cachecatch-report-"

export function encodeReportId(report: CachecatchReport): string {
  return report.id
}

export function saveReportToStorage(report: CachecatchReport): void {
  if (typeof window === "undefined") return
  try {
    const key = `${STORAGE_PREFIX}${report.id}`
    sessionStorage.setItem(key, JSON.stringify(report))
  } catch {
  }
}

export function loadReportFromStorage(id: string): CachecatchReport | null {
  if (typeof window === "undefined") return null
  try {
    const key = `${STORAGE_PREFIX}${id}`
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as CachecatchReport
  } catch {
    return null
  }
}

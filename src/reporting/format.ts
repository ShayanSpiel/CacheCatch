/**
 * Number / formatting helpers used by the terminal report.
 */

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—"
  if (value === 0) return "0"
  return Math.round(value).toLocaleString("en-US")
}

export function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "$0"
  return `$${Math.round(value).toLocaleString("en-US")}`
}

export function formatUsdPrecise(value: number): string {
  if (!Number.isFinite(value)) return "$0.00"
  return `$${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`
}

export function formatPercent(value: number | null, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  return `${(value * 100).toFixed(digits)}%`
}

export function formatTokensShort(value: number): string {
  if (!Number.isFinite(value)) return "—"
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return formatNumber(value)
}

export function padRight(text: string, width: number): string {
  const visible = text.replace(/\u001b\[[0-9;]*m/g, "").length
  if (visible >= width) return text
  return text + " ".repeat(width - visible)
}

export function padLeft(text: string, width: number): string {
  const visible = text.replace(/\u001b\[[0-9;]*m/g, "").length
  if (visible >= width) return text
  return " ".repeat(width - visible) + text
}

export function truncate(text: string, max: number): string {
  if (!text) return ""
  if (text.length <= max) return text
  return text.slice(0, Math.max(0, max - 1)) + "…"
}

export function titleCase(s: string): string {
  return s
    .replace(/[_-]+/g, " ")
    .split(" ")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
}

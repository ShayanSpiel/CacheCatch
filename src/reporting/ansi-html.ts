type AnsiState = {
  bold: boolean
  dim: boolean
  color?: string
}

const RESET = "\u001b[0m"
const ANSI_RE = /\u001b\[((?:\d{1,3};?)+)m/g

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function colorFor(code: number, bright: boolean): string | undefined {
  const palette: Record<number, string> = {
    30: "#111111",
    31: "#dc2626",
    32: "#16a34a",
    33: "#ca8a04",
    34: "#2563eb",
    35: "#7c3aed",
    36: "#0891b2",
    37: "#e5e7eb",
  }
  const brightPalette: Record<number, string> = {
    90: "#6b7280",
    91: "#ef4444",
    92: "#4ade80",
    93: "#facc15",
    94: "#60a5fa",
    95: "#c084fc",
    96: "#22d3ee",
    97: "#f8fafc",
  }
  return bright ? brightPalette[code] : palette[code]
}

function openSpan(state: AnsiState): string {
  const style: string[] = []
  if (state.bold) style.push("font-weight:700")
  if (state.dim) style.push("opacity:.72")
  if (state.color) style.push(`color:${state.color}`)
  return style.length ? `<span style="${style.join(";")}">` : ""
}

function closeSpan(state: AnsiState): string {
  return state.bold || state.dim || state.color ? "</span>" : ""
}

function applyCodes(state: AnsiState, codes: number[]): AnsiState {
  let next = { ...state }

  for (let i = 0; i < codes.length; i++) {
    const code = codes[i]
    if (code === 0) {
      next = { bold: false, dim: false }
      continue
    }
    if (code === 1) {
      next.bold = true
      continue
    }
    if (code === 2) {
      next.dim = true
      continue
    }
    if (code === 22) {
      next.bold = false
      next.dim = false
      continue
    }
    if (code === 39) {
      delete next.color
      continue
    }
    if (code === 38 && codes[i + 1] === 2) {
      const r = codes[i + 2]
      const g = codes[i + 3]
      const b = codes[i + 4]
      if ([r, g, b].every((n) => Number.isFinite(n))) {
        next.color = `rgb(${r},${g},${b})`
      }
      i += 4
      continue
    }
    if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
      next.color = colorFor(code, code >= 90)
    }
  }

  return next
}

function flushChunk(
  chunks: string[],
  state: AnsiState,
  text: string
): void {
  if (!text) return
  chunks.push(`${openSpan(state)}${escapeHtml(text)}${closeSpan(state)}`)
}

export function ansiToHtml(input: string): string {
  const parts: string[] = []
  let state: AnsiState = { bold: false, dim: false }
  let lastIndex = 0

  for (const match of input.matchAll(ANSI_RE)) {
    const index = match.index ?? 0
    flushChunk(parts, state, input.slice(lastIndex, index))
    const codes = match[1]
      .split(";")
      .map((n) => Number.parseInt(n, 10))
      .filter((n) => Number.isFinite(n))
    state = applyCodes(state, codes)
    lastIndex = index + match[0].length
  }

  flushChunk(parts, state, input.slice(lastIndex))

  const html = parts.join("")
  return html.endsWith(RESET) ? html.slice(0, -RESET.length) : html
}

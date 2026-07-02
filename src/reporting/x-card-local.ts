import type { LocalAgentReport, LocalAgentProvider } from "../types/index.ts"

export interface IdeAgentXCardData {
  handle: string
  avatarUrl?: string
  verified?: boolean
  auditLabel?: string
  sessionsTotal: string
  windowLabel: string
  agents: Array<{ name: string; count: string; logoUrl: string }>
  missRangeEstimate: string
  missRangeHigh: number
  command?: string
  domain?: string
  agentProfile: {
    primaryModel: string
    primaryModelSessions: string
    totalTokens: string
    toolCalls: string
    subagentRuns: string
  }
  cacheProfile: {
    cacheReadRate: string
    cacheReadRateNum: number
    cacheReadLabel: string
    uncachedRepeatContext: string
    uncachedRepeatContextNum: number
    stableContextReuse: string
    stableContextReuseNum: number
    stableContextReuseLabel: string
    topBreaker: string
  }
}

const DEFAULT_LOGOS: Record<string, string> = {
  "claude-code":
    "https://upload.wikimedia.org/wikipedia/commons/b/b0/Claude_AI_symbol.svg",
  codex:
    "data:image/svg+xml,%3Csvg%20version%3D%221.2%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%20250%20250%22%20width%3D%22250%22%20height%3D%22250%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22P%22%20gradientUnits%3D%22userSpaceOnUse%22/%3E%3ClinearGradient%20id%3D%22g1%22%20x2%3D%221%22%20href%3D%22%23P%22%20gradientTransform%3D%22matrix%280%2C249.335%2C-249.128%2C0%2C125%2C.332%29%22%3E%3Cstop%20stop-color%3D%22%23b1a7ff%22/%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%237a9dff%22/%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%233941ff%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Cstyle%3E.a%7Bfill%3Aurl%28%23g1%29%7D%3C/style%3E%3Cpath%20class%3D%22a%22%20d%3D%22m84.3%205.1q3.7-1.5%207.7-2.6%203.9-1%207.9-1.6%204-0.5%208.1-0.6%204%200%208%200.5%2020.7%202.4%2037.1%2017.7%200.1%200.1%200.4%200.3%200.1%200%200.2%200%200%200%200.2%200%200%200%200.1%200%200%200%200.1%200%205.2-1.4%2010.7-1.9%205.4-0.4%2010.7%200.1%205.5%200.4%2010.7%201.9%205.2%201.3%2010.1%203.6l0.6%200.4%201.6%200.8q5.2%202.5%209.7%206.1%204.7%203.4%208.6%207.7%203.8%204.3%206.9%209.2%203%204.8%205.2%2010.2%204.3%2010.5%204.3%2022.1%200.2%202.1%200%204.2-0.1%202.2-0.2%204.3-0.3%202.1-0.7%204.3-0.4%202.1-0.9%204.1%200%200.2%200%200.4%200%200.2%200%200.5%200%200.1%200.1%200.4%200.1%200.1%200.3%200.3%2012.3%2012.6%2016.3%2030%206%2029.7-12.2%2053.5l-1.9%202.2q-3%203.5-6.5%206.4-3.4%203.1-7.3%205.5-3.8%202.4-8.1%204.2-4.1%201.9-8.5%203.2-0.3%200-0.4%200.2-0.3%200-0.4%200.1-0.1%200.1-0.3%200.4%200%200.1-0.1%200.3c-2.7%207.7-5.3%2014.2-10.2%2020.7-12.5%2016.5-30.8%2025.5-51.5%2025.5q-24.6-0.1-43.6-18.1-0.2-0.1-0.4-0.2-0.2-0.1-0.4-0.1-0.2%200-0.3%200-0.3%200-0.4%200c-5.4%201.7-10.9%201.9-16.7%201.9q-3.5%200-7-0.5-3.4-0.4-6.9-1.2-3.3-0.8-6.6-2-3.3-1.2-6.4-2.8-3.3-1.6-6.4-3.6-3-2-5.8-4.3-3-2.3-5.5-5-2.5-2.6-4.6-5.6c-2.2-2.7-4.3-5.4-5.8-8.5q-0.8-1.6-1.6-3.2-0.6-1.7-1.3-3.3-0.7-1.7-1.2-3.4-0.5-1.6-1-3.4-1.1-4-1.6-7.9-0.6-4-0.6-8%200-4%200.6-8%200.4-4%201.4-8%200%200%200-0.1%200-0.1%200-0.1%200.2-0.2%200.2-0.3%200-0.1-0.2-0.1%200-0.2%200-0.3%200-0.1-0.1-0.1%200-0.2%200-0.2-0.1-0.1-0.1-0.1-2.4-2.5-4.6-5.2-2.1-2.7-4-5.4-1.7-3-3.2-6-1.5-3.1-2.6-6.3-0.8-2-1.3-4.1-0.7-2-1.1-4-0.4-2.1-0.7-4.2-0.2-2.2-0.4-4.3-0.2-2.8-0.1-5.6%200-2.8%200.3-5.4%200.1-2.8%200.6-5.6%200.4-2.8%201.1-5.5%207-23.1%2026.9-36.3%204.3-2.9%208.2-4.5%204.5-1.9%209-3.2%200.2%200%200.3-0.1%200.1-0.2%200.3-0.3%200.1%200%200.1-0.3%200.1-0.1%200.1-0.2%201-3.1%202.2-6%201-2.9%202.5-5.7%201.5-3%203.2-5.6%201.7-2.7%203.7-5.1%202.5-3.2%205.3-5.9%203-2.8%206.1-5.4%203.2-2.4%206.8-4.4%203.5-2%207.2-3.5zm48.3%20146.4c-2.3%200.1-4.4%201-6%202.8-1.5%201.6-2.4%203.7-2.4%205.9%200%202.3%200.9%204.4%202.4%206.2%201.6%201.6%203.7%202.5%206%202.6h50.4c2.4%200.1%204.8-0.6%206.5-2.4%201.7-1.6%202.8-4%202.8-6.4%200-2.4-1.1-4.7-2.8-6.3-1.7-1.8-4.1-2.6-6.5-2.4zm-56.7-64.9c-1.2-1.9-3-3.4-5.3-3.9-2.2-0.5-4.5-0.3-6.5%200.9-2%201.1-3.5%203-4.1%205.2-0.7%202.2-0.4%204.6%200.6%206.5l17.7%2030.9-17.5%2029.5c-1.2%202-1.6%204.5-1.1%206.8%200.7%202.3%202.1%204.1%204.1%205.3%202%201.2%204.4%201.6%206.7%200.9%202.2-0.5%204.2-1.9%205.4-3.9l20.1-34.1q0.7-0.9%200.9-2.1%200.3-1.1%200.3-2.3%200-1.2-0.3-2.2-0.2-1.2-0.8-2.2z%22/%3E%3C/svg%3E",
  opencode:
    "data:image/svg+xml,%3Csvg%20width%3D%27240%27%20height%3D%27300%27%20viewBox%3D%270%200%20240%20300%27%20fill%3D%27none%27%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%3E%3Cg%20clip-path%3D%27url%28%23clip0_1401_86283%29%27%3E%3Cmask%20id%3D%27mask0_1401_86283%27%20style%3D%27mask-type%3Aluminance%27%20maskUnits%3D%27userSpaceOnUse%27%20x%3D%270%27%20y%3D%270%27%20width%3D%27240%27%20height%3D%27300%27%3E%3Cpath%20d%3D%27M240%200H0V300H240V0Z%27%20fill%3D%27white%27/%3E%3C/mask%3E%3Cg%20mask%3D%27url%28%23mask0_1401_86283%29%27%3E%3Cpath%20d%3D%27M180%20240H60V120H180V240Z%27%20fill%3D%27%234B4646%27/%3E%3Cpath%20d%3D%27M180%2060H60V240H180V60ZM240%20300H0V0H240V300Z%27%20fill%3D%27%23F1ECEC%27/%3E%3C/g%3E%3C/g%3E%3Cdefs%3E%3CclipPath%20id%3D%27clip0_1401_86283%27%3E%3Crect%20width%3D%27240%27%20height%3D%27300%27%20fill%3D%27white%27/%3E%3C/clipPath%3E%3C/defs%3E%3C/svg%3E",
}

const AGENT_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  opencode: "OpenCode",
}

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

function formatTokens(n: number): string {
  if (n >= 1_000_000_000) {
    const v = n / 1_000_000_000
    return v === Math.floor(v) ? `${v}B` : `${v.toFixed(1)}B`
  }
  if (n >= 1_000_000) {
    const v = n / 1_000_000
    return v === Math.floor(v) ? `${v}M` : `${v.toFixed(1)}M`
  }
  if (n >= 1_000) {
    const v = n / 1_000
    return v === Math.floor(v) ? `${v}K` : `${v.toFixed(1)}K`
  }
  return fmtNum(n)
}

function cacheReadColor(pct: number): string {
  if (pct >= 0.6) return "#74f59a"
  if (pct >= 0.35) return "#f6e85c"
  return "#ff5d55"
}

function cacheReadLabel(pct: number): string {
  if (pct >= 0.6) return "elite"
  if (pct >= 0.35) return "healthy"
  if (pct >= 0.15) return "leaky"
  return "cold"
}

function cacheWriteColor(n: number): string {
  return n === 0 ? "#74f59a" : "#f6e85c"
}

function rangeLabel(report: LocalAgentReport): string {
  const r = report.summary.estimatedCacheMissRange
  if (!r) return "N/A"
  return `~${r.lowPercent}\u2013${r.highPercent}%`
}

function primaryModelEntry(
  report: LocalAgentReport
): { model: string; sessions: number } {
  const models = report.modelsDetected ?? []
  const sorted = [...models].sort((a, b) => b.sessions - a.sessions)
  const top = sorted[0]
  return {
    model: top?.rawName ?? "N/A",
    sessions: top?.sessions ?? 0,
  }
}

function stableContextLabel(score: number | null): string {
  if (score == null) return "N/A"
  if (score >= 60) return "great"
  if (score >= 35) return "doing good"
  return "poor"
}

function stableContextColor(score: number | null): string {
  if (score == null) return "#ffffff"
  if (score >= 60) return "#74f59a"
  if (score >= 35) return "#f6e85c"
  return "#ff5d55"
}

function uncachedColor(highPercent: number): string {
  if (highPercent >= 40) return "#ff5d55"
  if (highPercent >= 25) return "#f6e85c"
  return "#74f59a"
}

function topBreakerLabel(findings: LocalAgentReport["findings"]): string {
  const high = findings.find((f) => f.severity === "high")
  return high?.title ?? findings[0]?.title ?? "N/A"
}

function agentRows(
  report: LocalAgentReport
): Array<{ name: string; count: string; logoUrl: string }> {
  const agents = report.agents ?? []
  const known: LocalAgentProvider[] = ["claude-code", "codex", "opencode"]
  return known.map((key) => {
    const a = agents.find((ag) => ag.provider === key)
    return {
      name: AGENT_LABELS[key] ?? key,
      count: a ? fmtNum(a.sessionsFound) : "0",
      logoUrl: DEFAULT_LOGOS[key] ?? "",
    }
  })
}

export function localAgentReportToIdeCardData(
  report: LocalAgentReport,
  options: {
    handle: string
    avatarUrl?: string
    verified?: boolean
    domain?: string
  }
): IdeAgentXCardData {
  const s = report.summary
  const r = s.estimatedCacheMissRange
  const pm = primaryModelEntry(report)
  const cacheLeakScore = s.cacheLeakScore ?? 0
  const readRate = s.cacheReadPercent ?? 0
  const highPct = r?.highPercent ?? 0
  return {
    handle: options.handle,
    avatarUrl: options.avatarUrl,
    verified: options.verified,
    auditLabel: `CacheCatch ${report.window} IDE Agent Report`,
    sessionsTotal: fmtNum(s.sessionsFound ?? s.sessionsAnalyzed ?? 0),
    windowLabel: report.window,
    agents: agentRows(report),
    missRangeEstimate: rangeLabel(report),
    missRangeHigh: highPct,
    command: "npx cachecatch audit local --window 7d",
    domain: options.domain ?? "cachecatch.spielos.xyz",
    agentProfile: {
      primaryModel: pm.model,
      primaryModelSessions: fmtNum(pm.sessions),
      totalTokens: formatTokens(s.totalTokens ?? 0),
      toolCalls: fmtNum(report.activity?.toolCalls ?? s.toolCalls ?? 0),
      subagentRuns: fmtNum(report.activity?.subagentRuns ?? s.subagentRuns ?? 0),
    },
    cacheProfile: {
      cacheReadRate: `${Math.round(readRate * 100)}%`,
      cacheReadRateNum: readRate,
      cacheReadLabel: cacheReadLabel(readRate),
      uncachedRepeatContext: `${highPct}%`,
      uncachedRepeatContextNum: highPct,
      stableContextReuse: `${cacheLeakScore}/100`,
      stableContextReuseNum: cacheLeakScore,
      stableContextReuseLabel: stableContextLabel(cacheLeakScore),
      topBreaker: topBreakerLabel(report.findings ?? []),
    },
  }
}

export function demoIdeAgentXCardData(): IdeAgentXCardData {
  return {
    handle: "@ShayanSpiel",
    avatarUrl: "https://unavatar.io/x/ShayanSpiel",
    verified: true,
    auditLabel: "CacheCatch 7 days IDE Agent Report",
    sessionsTotal: "1,291",
    windowLabel: "7 days",
    agents: [
      { name: "Claude Code", count: "16", logoUrl: DEFAULT_LOGOS["claude-code"] },
      { name: "Codex", count: "275", logoUrl: DEFAULT_LOGOS["codex"] },
      { name: "OpenCode", count: "1,000", logoUrl: DEFAULT_LOGOS["opencode"] },
    ],
    missRangeEstimate: "~19–36%",
    missRangeHigh: 36,
    command: "npx cachecatch audit local --window 7d",
    domain: "cachecatch.spielos.xyz",
    agentProfile: {
      primaryModel: "deepseek-v4-flash-free",
      primaryModelSessions: "418",
      totalTokens: "4.5B",
      toolCalls: "64,149",
      subagentRuns: "971",
    },
    cacheProfile: {
      cacheReadRate: "93%",
      cacheReadRateNum: 0.93,
      cacheReadLabel: "elite",
      uncachedRepeatContext: "36%",
      uncachedRepeatContextNum: 36,
      stableContextReuse: "58/100",
      stableContextReuseNum: 58,
      stableContextReuseLabel: "doing good",
      topBreaker: "Dynamic fields before stable context",
    },
  }
}

export function renderIdeAgentXCardHtml(data: IdeAgentXCardData): string {
  const handle = data.handle.startsWith("@") ? data.handle : `@${data.handle}`
  const handleClean = handle.replace("@", "")
  const avatarUrl =
    data.avatarUrl || `https://unavatar.io/x/${handleClean}`
  const verifiedBadge = data.verified
    ? `<span style="display:inline-flex;align-items:center;margin-left:6px"><svg width="20" height="20" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg"><path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" fill="#1d9bf0"/></svg></span>`
    : ""
  const auditLabel =
    data.auditLabel || `CacheCatch ${data.windowLabel} IDE Agent Report`
  const domain = data.domain || "cachecatch.spielos.xyz"
  const command = data.command || "npx cachecatch audit local --window 7d"
  const agents = [...data.agents]
  while (agents.length < 3)
    agents.push({ name: "\u2014", count: "0", logoUrl: "" })

  const missNote = data.missRangeHigh > 0
    ? `<div style="margin-top:10px"><div style="color:#ffffff;font-size:12px;line-height:1.3;font-weight:700">CacheCatch report indicates optimizing cache could save you up to ${data.missRangeHigh}% repeated token costs.</div><div style="margin-top:5px"><span style="display:inline-block;border:1px solid rgba(116,245,154,.45);border-radius:4px;padding:3px 10px;color:#74f59a;font-size:11px;font-weight:700;letter-spacing:.03em">Get CacheCatch report now <span style="font-size:9px">\u25BC</span></span></div></div>`
    : ""

  const readColor = cacheReadColor(data.cacheProfile.cacheReadRateNum)
  const stableColor = stableContextColor(data.cacheProfile.stableContextReuseNum)
  const uncachedColorVal = uncachedColor(data.cacheProfile.uncachedRepeatContextNum)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1024, initial-scale=1" />
<title>CacheCatch IDE Agent X Card</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Micro+5&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#050605;
  --ink:#f4f5f1;
  --green:#74f59a;
  --panel-bg:rgba(5,8,6,.65);
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{
  width:1024px;height:732px;
  overflow:hidden;
  background:#020302;
  color:var(--ink);
  font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
}
.card{
  position:relative;width:1024px;height:732px;overflow:hidden;
  background:
    radial-gradient(circle at 70% 14%,rgba(116,245,154,.075),transparent 28%),
    radial-gradient(circle at 14% 85%,rgba(116,245,154,.035),transparent 22%),
    linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),
    linear-gradient(90deg,rgba(255,255,255,.018) 1px,transparent 1px),
    #050605;
  background-size:auto,auto,18px 18px,18px 18px,auto;
}
.card:after{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 42%,transparent 48%,rgba(0,0,0,.42) 100%)}
.border{position:absolute;inset:18px 16px 18px 16px;border:1.2px solid rgba(116,245,154,.55);border-radius:12px;z-index:1;box-shadow:0 0 32px rgba(116,245,154,.04),inset 0 0 32px rgba(116,245,154,.02)}
.slogan{position:absolute;top:44px;left:0;right:0;text-align:center;z-index:3;color:#8a948d;font-size:12px;letter-spacing:.28em;font-weight:700;text-transform:uppercase}
.user{position:absolute;top:62px;left:56px;display:flex;align-items:center;gap:16px;z-index:3}
.avatar{width:88px;height:88px;border-radius:50%;border:1.6px solid var(--green);background:#09120c;overflow:hidden;box-shadow:0 0 20px rgba(116,245,154,.12);flex:0 0 88px}
.avatar img{width:100%;height:100%;object-fit:cover;display:block}
.avatar .fallback{display:none;width:100%;height:100%;place-items:center;font-family:"Micro 5";font-size:64px;color:var(--green)}
.handle{display:flex;align-items:center;gap:0;font-size:25px;line-height:1;letter-spacing:-.045em;font-weight:800;color:#fff}
.audit{margin-top:10px;color:var(--green);font-size:17px;font-weight:500}
.safe{position:absolute;top:70px;right:58px;z-index:3;border:1px solid rgba(116,245,154,.5);color:var(--green);background:rgba(4,9,5,.5);border-radius:6px;padding:10px 18px;font-size:13px;font-weight:800;letter-spacing:.08em}
.domain{position:absolute;top:118px;right:62px;z-index:3;font-size:14px;color:#b8c2ba;letter-spacing:.06em}
.rule{position:absolute;top:156px;left:54px;right:54px;height:1px;background:rgba(255,255,255,.08);z-index:3}
.left-main{position:absolute;left:56px;top:190px;width:420px;z-index:3;padding-right:24px;border-right:1px solid rgba(255,255,255,.12)}
.sessions{font-family:"Micro 5";font-size:120px;line-height:.72;color:#fff;letter-spacing:.05em;white-space:nowrap}
.session-sub{margin-top:8px;font-family:"Micro 5";color:var(--green);font-size:30px;letter-spacing:.07em;line-height:.78;text-transform:uppercase}
.agent-row{margin-top:18px;width:390px}
.agent{display:grid;grid-template-columns:26px 1fr 60px;align-items:center;gap:12px;height:30px;padding:0 2px}
.agent-name{color:#b9c5bc;font-size:12px;font-weight:700}
.agent-num{font-family:"Micro 5";color:var(--green);font-size:32px;line-height:.7;text-align:right;letter-spacing:.04em}
.logo-img{width:22px;height:22px;object-fit:contain;display:block;border-radius:3px}
.slab{position:absolute;top:172px;right:56px;width:475px;height:258px;z-index:3;padding:28px 48px 0}
.slab:before{content:"";position:absolute;inset:0;transform:skewX(-5deg);background:linear-gradient(180deg,rgba(116,245,154,.2),rgba(116,245,154,.08)),radial-gradient(circle at 50% 15%,rgba(116,245,154,.15),transparent 60%);border:1px solid rgba(116,245,154,.25);border-radius:2px;box-shadow:inset 0 0 80px rgba(116,245,154,.05),0 0 18px rgba(116,245,154,.03)}
.slab-inner{position:relative;z-index:1}
.slab-label{font-family:"Micro 5";font-size:28px;color:var(--green);letter-spacing:.08em;line-height:.85;text-transform:uppercase}
.amount{margin-top:12px;font-family:"Micro 5";font-size:112px;line-height:.72;letter-spacing:.04em;color:var(--green);white-space:nowrap}
.amount small{font-size:46px;letter-spacing:.04em}
.findings{position:absolute;left:56px;top:448px;width:420px;height:200px;z-index:3;border:1px dashed rgba(116,245,154,.35);border-radius:8px;background:var(--panel-bg);padding:12px 18px;overflow:hidden}
.panel-title{color:var(--green);font-family:"Micro 5";font-size:22px;letter-spacing:.1em;margin-bottom:6px}
.find-row{display:grid;grid-template-columns:105px 1fr;gap:0;padding:7px 0;border-top:1px dashed rgba(255,255,255,.08);font-size:11px;line-height:1.2}
.find-row:first-of-type{border-top:1px solid rgba(255,255,255,.1)}
.key{color:#b0b8b2;font-size:8.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap}
.val{color:#e8ede9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:700}
.val-num{font-family:"JetBrains Mono",monospace;font-size:16px;font-weight:800;letter-spacing:.01em;line-height:1}
.val-sub{font-family:"JetBrains Mono",monospace;font-size:11px;font-weight:600;letter-spacing:.01em;color:#8a948d}
.val-arrow{font-family:"JetBrains Mono",monospace;font-size:11px;font-weight:600;color:#8a948d;margin:0 3px}
.matters{position:absolute;right:56px;top:448px;width:470px;height:200px;z-index:3;border:1px dashed rgba(116,245,154,.35);border-radius:8px;background:var(--panel-bg);padding:12px 18px;overflow:hidden}
.metric-list{margin-top:0}
.metric-row{display:grid;grid-template-columns:105px 1fr;align-items:baseline;gap:0;padding:7px 0;border-top:1px dashed rgba(255,255,255,.08)}
.metric-row:first-child{border-top:1px solid rgba(255,255,255,.1)}
.metric-k{color:#b0b8b2;font-size:8.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap}
.metric-v{font-family:"JetBrains Mono",monospace;font-weight:800;font-size:16px;line-height:1;letter-spacing:.01em;white-space:nowrap}
.metric-note{color:#8a948d;font-size:9.5px;line-height:1.15}
.footer{position:absolute;left:56px;right:56px;bottom:32px;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:20px}
.brand{display:flex;align-items:center;gap:12px}
.mark{width:38px;height:38px;color:var(--green);font-family:"Micro 5";font-size:40px;display:grid;place-items:center;line-height:1}
.brand-name{font-family:"Micro 5";font-size:40px;line-height:.8;letter-spacing:.05em;color:#fff}
.command{min-width:370px;border:1px solid rgba(116,245,154,.3);background:rgba(7,12,8,.5);border-radius:6px;padding:11px 22px;font-size:14px;color:#c8d4ca;text-align:center}
.command b{color:var(--green)}
.credit{font-size:13px;color:#8a948d}
.credit b{color:var(--green)}
</style>
</head>
<body>
<div class="card">
  <div class="border"></div>
  <div class="slogan">CATCH THE CACHE THAT BURNS THE CA$H.</div>

  <div class="user">
    <div class="avatar">
      <img src="${esc(avatarUrl)}" alt="${esc(handle)}" onerror="this.style.display='none';this.nextElementSibling.style.display='grid';">
      <span class="fallback">${esc(handleClean.charAt(0).toUpperCase())}</span>
    </div>
    <div>
      <div class="handle">${esc(handle)}${verifiedBadge}</div>
      <div class="audit">${esc(auditLabel)}</div>
    </div>
  </div>

  <div class="safe"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:5px"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>PUBLIC-SAFE SHARE</div>
  <div class="domain">${esc(domain)}</div>
  <div class="rule"></div>

  <section class="left-main">
    <div class="sessions">${esc(data.sessionsTotal)}</div>
    <div class="session-sub">AGENTIC SESSIONS SCANNED</div>
    <div class="agent-row">
      <div class="agent"><img class="logo-img" src="${esc(agents[0].logoUrl)}" alt="Claude Code"/><span class="agent-name">${esc(agents[0].name)}</span><span class="agent-num">${esc(agents[0].count)}</span></div>
      <div class="agent"><img class="logo-img" src="${esc(agents[1].logoUrl)}" alt="Codex"/><span class="agent-name">${esc(agents[1].name)}</span><span class="agent-num">${esc(agents[1].count)}</span></div>
      <div class="agent"><img class="logo-img" src="${esc(agents[2].logoUrl)}" alt="OpenCode"/><span class="agent-name">${esc(agents[2].name)}</span><span class="agent-num">${esc(agents[2].count)}</span></div>
    </div>
  </section>

  <section class="slab">
    <div class="slab-inner">
      <div class="slab-label">RECOVERABLE COST GAP EST.</div>
      <div class="amount">${esc(data.missRangeEstimate.replace("%", ""))}<small>%</small></div>
      ${missNote}
    </div>
  </section>

  <section class="findings">
    <div class="panel-title">AGENT RUN PROFILE</div>
    <div class="find-row"><div class="key">Primary model</div><div class="val"><span class="val-num" style="color:#fff;max-width:180px;display:inline-block;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom">${esc(data.agentProfile.primaryModel)}</span><span class="val-arrow"> → </span><span class="val-sub">${esc(data.agentProfile.primaryModelSessions)} sessions</span></div></div>
    <div class="find-row"><div class="key">Total tokens</div><div class="val"><span class="val-num" style="color:#fff">${esc(data.agentProfile.totalTokens)}</span><span class="val-arrow"> → </span><span class="val-sub">Across agents</span></div></div>
    <div class="find-row"><div class="key">Tool calls</div><div class="val"><span class="val-num" style="color:#fff">${esc(data.agentProfile.toolCalls)}</span></div></div>
    <div class="find-row"><div class="key">Subagent runs</div><div class="val"><span class="val-num" style="color:#fff">${esc(data.agentProfile.subagentRuns)}</span></div></div>
  </section>

  <section class="matters">
    <div class="panel-title">CACHE PROFILE</div>
    <div class="metric-list">
      <div class="metric-row"><div class="metric-k">Cache read rate</div><div class="metric-v"><span class="val-num" style="color:${readColor}">${esc(data.cacheProfile.cacheReadRate)}</span><span class="val-arrow" style="color:${readColor}"> → </span><span class="val-sub" style="color:${readColor}">${esc(data.cacheProfile.cacheReadLabel)} profile</span></div></div>
      <div class="metric-row"><div class="metric-k">Uncached repeat</div><div class="metric-v"><span class="val-num" style="color:${uncachedColorVal}">${esc(data.cacheProfile.uncachedRepeatContext)}</span><span class="val-arrow" style="color:${uncachedColorVal}"> → </span><span class="val-sub" style="color:${uncachedColorVal}">Saving opportunity!</span></div></div>
      <div class="metric-row"><div class="metric-k">Context reuse</div><div class="metric-v"><span class="val-num" style="color:${stableColor}">${esc(data.cacheProfile.stableContextReuse)}</span><span class="val-arrow" style="color:${stableColor}"> → </span><span class="val-sub" style="color:${stableColor}">${esc(data.cacheProfile.stableContextReuseLabel)}</span></div></div>
      <div class="metric-row"><div class="metric-k">#1 Cache breaker</div><div class="metric-v"><span class="val-sub" style="color:#ffffff">${esc(data.cacheProfile.topBreaker)}</span></div></div>
    </div>
  </section>

  <footer class="footer">
    <div class="brand">
      <div class="mark">$</div>
      <div class="brand-name">CACHECATCH</div>
    </div>
    <div class="command">$ ${esc(command).replace("cachecatch", "<b>cachecatch</b>")}</div>
    <div class="credit">built by <b>${esc(handle)}</b></div>
  </footer>
</div>
</body>
</html>`
}

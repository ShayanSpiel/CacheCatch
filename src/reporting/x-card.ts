/**
 * X Card HTML template — generates a 1024×732 shareable banner
 * from a CachecatchReport and the user's X handle.
 *
 * The template is embedded directly so there is no runtime file dependency.
 */

import type { CachecatchReport } from "../types/index.ts"
import { WINDOW_LABELS } from "../engine/constants.ts"
import { formatNumber, formatPercent, formatUsd } from "./format.ts"

export interface XCardOptions {
  handle: string
  avatarUrl: string
  verified: boolean
  auditLabel?: string
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function scoreClass(score: number): string {
  return score < 40 ? "bad" : ""
}

function alertLabel(score: number): string {
  if (score < 30) return "▲ CRITICAL CACHE LEAK DETECTED"
  if (score < 55) return "▲ HIGH CACHE LEAK DETECTED"
  return "▲ CACHE LEAK DETECTED"
}

function topRoute(report: CachecatchReport): string {
  const sorted = [...report.routes].sort(
    (a, b) => b.estimatedMonthlyWasteUsd - a.estimatedMonthlyWasteUsd
  )
  return sorted[0]?.route ?? "—"
}

function topBreaker(report: CachecatchReport): string {
  return report.summary.topBreaker || "early prefix divergence"
}

function topFirstDivergence(report: CachecatchReport): string {
  const sorted = [...report.routes].sort(
    (a, b) => b.estimatedMonthlyWasteUsd - a.estimatedMonthlyWasteUsd
  )
  const token = sorted[0]?.avgFirstDivergenceToken ?? 0
  return `token ${formatNumber(token)}`
}

function topFix(report: CachecatchReport): string {
  return (
    report.fixPlan[0] ??
    "move volatile metadata to dynamic tail"
  )
}

function cacheReadRate(report: CachecatchReport): string {
  const rate = report.summary.observedCacheReadRate
  if (rate === null) return "N/A"
  return formatPercent(rate)
}

function wasteShort(report: CachecatchReport): string {
  const usd = report.summary.estimatedMonthlyWasteUsd
  if (usd >= 1000) return `+$${Math.round(usd / 1000)}k`
  return `+$${Math.round(usd)}`
}

function windowLabel(report: CachecatchReport): string {
  return WINDOW_LABELS[report.window] || report.window
}

function derivedAuditLabel(report: CachecatchReport): string {
  return `CacheCatch ${windowLabel(report)} Agentic Cache Report`
}

export function renderXCardHtml(
  report: CachecatchReport,
  options: XCardOptions
): string {
  const handle = options.handle.startsWith("@") ? options.handle : `@${options.handle}`
  const handleClean = handle.replace("@", "")
  const avatarUrl = options.avatarUrl || `https://unavatar.io/x/${handleClean}`
  const auditLabel = options.auditLabel ?? derivedAuditLabel(report)
  const score = report.score
  const waste = formatUsd(report.summary.estimatedMonthlyWasteUsd)
  const wasteS = wasteShort(report)
  const runs = formatNumber(report.summary.runsAnalyzed)
  const window = windowLabel(report)
  const route = topRoute(report)
  const breaker = topBreaker(report)
  const divergence = topFirstDivergence(report)
  const fix = topFix(report)
  const rate = cacheReadRate(report)
  const alert = alertLabel(score)
  const checkHtml = options.verified
    ? `<span class="check">\u2713</span>`
    : ""

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1024, initial-scale=1" />
<title>CacheCatch X Card</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Micro+5&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#050605;
  --ink:#f4f5f1;
  --muted:#9ca49d;
  --muted2:#717a73;
  --green:#74f59a;
  --green2:#42d977;
  --red:#ff5d55;
  --blue:#38c8ff;
  --yellow:#f6e85c;
  --line:rgba(116,245,154,.34);
  --thin:rgba(255,255,255,.11);
  --thin2:rgba(255,255,255,.07);
  --panel-border:rgba(116,245,154,.35);
  --panel-bg:rgba(5,8,6,.65);
}
*{box-sizing:border-box}
html,body{
  margin:0;
  width:1024px;
  height:732px;
  overflow:hidden;
  background:#020302;
  color:var(--ink);
  font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
}
.card{
  position:relative;
  width:1024px;
  height:732px;
  overflow:hidden;
  background:
    radial-gradient(circle at 70% 14%, rgba(116,245,154,.075), transparent 28%),
    radial-gradient(circle at 14% 85%, rgba(116,245,154,.035), transparent 22%),
    linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px),
    #050605;
  background-size:auto,auto,18px 18px,18px 18px,auto;
}
.card:after{
  content:"";
  position:absolute;
  inset:0;
  pointer-events:none;
  background:radial-gradient(circle at 50% 42%, transparent 48%, rgba(0,0,0,.42) 100%);
}
.border{
  position:absolute;
  inset:18px 16px 18px 16px;
  border:1.2px solid rgba(116,245,154,.55);
  border-radius:12px;
  z-index:1;
  box-shadow:0 0 32px rgba(116,245,154,.04), inset 0 0 32px rgba(116,245,154,.02);
}
.slogan{
  position:absolute;
  top:44px;
  left:0;
  right:0;
  text-align:center;
  z-index:3;
  color:#8a948d;
  font-size:12px;
  letter-spacing:.28em;
  font-weight:700;
  text-transform:uppercase;
}
.user{
  position:absolute;
  top:62px;
  left:56px;
  display:flex;
  align-items:center;
  gap:16px;
  z-index:3;
}
.avatar{
  width:88px;
  height:88px;
  border-radius:50%;
  border:1.6px solid var(--green);
  background:#09120c;
  overflow:hidden;
  box-shadow:0 0 20px rgba(116,245,154,.12);
  flex:0 0 88px;
}
.avatar img{
  width:100%;
  height:100%;
  object-fit:cover;
  display:block;
}
.avatar .fallback{
  display:none;
  width:100%;
  height:100%;
  place-items:center;
  font-family:"Micro 5";
  font-size:64px;
  color:var(--green);
}
.handle{
  display:flex;
  align-items:center;
  gap:10px;
  font-size:25px;
  line-height:1;
  letter-spacing:-.045em;
  font-weight:800;
  color:#fff;
}
.check{
  width:20px;
  height:20px;
  border-radius:50%;
  display:inline-grid;
  place-items:center;
  background:var(--green);
  color:#031006;
  font-size:13px;
  font-weight:900;
  line-height:1;
}
.audit{
  margin-top:12px;
  color:var(--green);
  font-size:17px;
  font-weight:500;
}
.safe{
  position:absolute;
  top:70px;
  right:58px;
  z-index:3;
  border:1px solid rgba(116,245,154,.5);
  color:var(--green);
  background:rgba(4,9,5,.5);
  border-radius:6px;
  padding:10px 18px;
  font-size:13px;
  font-weight:800;
  letter-spacing:.08em;
}
.domain{
  position:absolute;
  top:118px;
  right:62px;
  z-index:3;
  font-size:14px;
  color:#b8c2ba;
  letter-spacing:.06em;
}
.rule{
  position:absolute;
  top:156px;
  left:54px;
  right:54px;
  height:1px;
  background:rgba(255,255,255,.08);
  z-index:3;
}
.left-main{
  position:absolute;
  left:56px;
  top:184px;
  width:420px;
  z-index:3;
  padding-right:24px;
  border-right:1px solid rgba(255,255,255,.12);
  min-height:240px;
}
.score-label{
  color:#8e968f;
  font-size:17px;
  font-weight:800;
  letter-spacing:.12em;
  text-transform:uppercase;
  margin-bottom:14px;
}
.score{
  font-family:"Micro 5";
  font-size:88px;
  line-height:.78;
  color:#fff;
  letter-spacing:.04em;
  white-space:nowrap;
}
.score .bad{color:var(--red)}
.score .slash{color:#666;margin:0 16px}
.alert{
  margin-top:16px;
  width:330px;
  border:1px solid var(--red);
  border-radius:5px;
  color:var(--red);
  background:rgba(255,93,85,.04);
  padding:8px 14px;
  font-size:13px;
  font-weight:800;
  letter-spacing:.08em;
  display:flex;
  align-items:center;
  justify-content:center;
  gap:6px;
}
.alert-icon{
  display:inline-flex;
  align-items:center;
  line-height:1;
}
.summary{
  margin-top:20px;
  color:#b0b8b2;
  font-size:14px;
  line-height:1.5;
  max-width:380px;
  display:-webkit-box;
  -webkit-line-clamp:3;
  -webkit-box-orient:vertical;
  overflow:hidden;
}
.slab{
  position:absolute;
  top:172px;
  right:56px;
  width:475px;
  height:258px;
  z-index:3;
  padding:40px 48px 0;
}
.slab:before{
  content:"";
  position:absolute;
  inset:0;
  transform:skewX(-5deg);
  background:
    linear-gradient(180deg,rgba(116,245,154,.2),rgba(116,245,154,.08)),
    radial-gradient(circle at 50% 15%,rgba(116,245,154,.15),transparent 60%);
  border:1px solid rgba(116,245,154,.25);
  border-radius:2px;
  box-shadow:inset 0 0 80px rgba(116,245,154,.05), 0 0 18px rgba(116,245,154,.03);
}
.slab-inner{position:relative;z-index:1}
.slab-label{
  font-family:"Micro 5";
  font-size:29px;
  color:var(--green);
  letter-spacing:.08em;
  line-height:.85;
  text-transform:uppercase;
}
.amount{
  margin-top:16px;
  font-family:"Micro 5";
  font-size:82px;
  line-height:.76;
  letter-spacing:.04em;
  color:var(--green);
  white-space:nowrap;
}
.amount small{
  font-size:36px;
  letter-spacing:.04em;
}
.slab-note{
  margin-top:22px;
  color:#a8dfb6;
  font-size:14px;
  line-height:1.35;
}
.findings{
  position:absolute;
  left:56px;
  top:450px;
  width:420px;
  height:180px;
  z-index:3;
  border:1px dashed rgba(116,245,154,.35);
  border-radius:8px;
  background:var(--panel-bg);
  padding:14px 20px;
  overflow:hidden;
}
.panel-title{
  color:var(--green);
  font-weight:800;
  font-size:13px;
  letter-spacing:.14em;
  margin-bottom:10px;
}
.find-row{
  display:grid;
  grid-template-columns:140px 1fr;
  gap:12px;
  padding:6px 0;
  border-top:1px dashed rgba(255,255,255,.08);
  font-size:11.5px;
  line-height:1.1;
}
.find-row:first-of-type{border-top:1px solid rgba(255,255,255,.1)}
.key{
  color:#b0b8b2;
}
.key:before{
  content:"";
  display:inline-block;
  width:5px;
  height:5px;
  margin-right:10px;
  transform:translateY(-1px);
  border-radius:2px;
  background:var(--green);
  box-shadow:0 0 8px rgba(116,245,154,.45);
}
.val{
  color:#e8ede9;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.matters{
  position:absolute;
  right:56px;
  top:450px;
  width:470px;
  height:178px;
  z-index:3;
  border:1px dashed rgba(116,245,154,.35);
  border-radius:8px;
  background:var(--panel-bg);
  padding:14px 20px;
  overflow:hidden;
}
.matter-grid{
  margin-top:14px;
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:0;
}
.matter{
  text-align:center;
  padding:4px 18px 0;
}
.matter + .matter{
  border-left:1px solid rgba(116,245,154,.35);
}
.matter-big{
  font-family:"Micro 5";
  color:var(--green);
  font-size:54px;
  line-height:.78;
  letter-spacing:.03em;
}
.matter-copy{
  margin-top:12px;
  color:#b0bbb2;
  font-size:12.5px;
  line-height:1.35;
}
.footer{
  position:absolute;
  left:56px;
  right:56px;
  bottom:40px;
  z-index:3;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:20px;
}
.brand{
  display:flex;
  align-items:center;
  gap:12px;
}
.mark{
  width:38px;
  height:38px;
  color:var(--green);
  font-family:"Micro 5";
  font-size:40px;
  display:grid;
  place-items:center;
  line-height:1;
}
.brand-name{
  font-family:"Micro 5";
  font-size:40px;
  line-height:.8;
  letter-spacing:.05em;
  color:#fff;
}
.command{
  min-width:340px;
  border:1px solid rgba(116,245,154,.3);
  background:rgba(7,12,8,.5);
  border-radius:6px;
  padding:11px 22px;
  font-size:14px;
  color:#c8d4ca;
  text-align:center;
}
.command b{color:var(--green)}
.credit{
  font-size:13px;
  color:#8a948d;
}
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
      <div class="handle">${esc(handle)} ${checkHtml}</div>
      <div class="audit">${esc(auditLabel)}</div>
    </div>
  </div>

  <div class="safe"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:5px"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>PUBLIC-SAFE SHARE</div>
  <div class="domain">cachecatch.spielos.xyz</div>
  <div class="rule"></div>

  <section class="left-main">
    <div class="score-label">CACHE LEAK SCORE</div>
    <div class="score"><span class="${scoreClass(score)}">${score}</span><span class="slash">/</span>100</div>
    <div class="alert"><span class="alert-icon">\u25b2</span> ${esc(alert.replace("▲ ", ""))}</div>
    <div class="summary">
      ${esc(runs)} agentic runs over ${esc(window.toLowerCase())}. CacheCatch found reusable tokens that never hit cache and surfaced the fix.
    </div>
  </section>

  <section class="slab">
    <div class="slab-inner">
      <div class="slab-label">RECOVERABLE CACHE SAVINGS</div>
      <div class="amount">${esc(waste)} <small>/ MO</small></div>
      <div class="slab-note">Estimated monthly savings after the recommended prompt fix</div>
    </div>
  </section>

  <section class="findings">
    <div class="panel-title">KEY FINDINGS</div>
    <div class="find-row"><div class="key">Top leaking route</div><div class="val">${esc(route)}</div></div>
    <div class="find-row"><div class="key">Primary cause</div><div class="val">${esc(breaker)}</div></div>
    <div class="find-row"><div class="key">First divergence</div><div class="val">${esc(divergence)}</div></div>
    <div class="find-row"><div class="key">Suggested fix</div><div class="val">${esc(fix)}</div></div>
  </section>

  <section class="matters">
    <div class="panel-title">WHY IT MATTERS</div>
    <div class="matter-grid">
      <div class="matter">
        <div class="matter-big">${esc(rate)}</div>
        <div class="matter-copy">of reusable tokens<br>missed cache reads</div>
      </div>
      <div class="matter">
        <div class="matter-big">${esc(wasteS)}</div>
        <div class="matter-copy">monthly savings<br>unlocked by one fix</div>
      </div>
    </div>
  </section>

  <footer class="footer">
    <div class="brand">
      <div class="mark">$</div>
      <div class="brand-name">CACHECATCH</div>
    </div>
    <div class="command">$ npx <b>cachecatch@latest</b> sample</div>
    <div class="credit">built by <b>${esc(handle)}</b></div>
  </footer>
</div>
</body>
</html>`
}

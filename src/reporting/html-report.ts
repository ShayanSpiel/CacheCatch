/**
 * HTMLGenerator — produces a self-contained, shareable HTML report
 * from a CachecatchReport.
 *
 * No external network requests. Inline CSS. Dark-on-white monochrome
 * to match the existing web app's aesthetic.
 */

import type { CachecatchReport, CacheFinding } from "../types/index.ts"
import {
  CACHE_BREAKER_LABELS,
  APP_NAME,
  APP_VERSION,
  PROVIDER_LABELS,
  WINDOW_LABELS,
} from "../engine/constants.ts"
import { formatNumber, formatUsd, formatPercent, formatTokensShort } from "./format.ts"

function escape(s: string): string {
  if (!s) return ""
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function severityClass(s: string): string {
  return `sev-${s}`
}

export function renderHtmlReport(report: CachecatchReport): string {
  const css = `
:root {
  --bg: #ffffff;
  --fg: #0a0a0a;
  --muted: #6b7280;
  --border: #e5e7eb;
  --card: #fafafa;
  --accent: #0a0a0a;
  --good: #16a34a;
  --warn: #d97706;
  --bad: #dc2626;
  --critical: #991b1b;
}
* { box-sizing: border-box; }
body {
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  background: var(--bg);
  color: var(--fg);
  margin: 0;
  padding: 48px 24px;
  line-height: 1.55;
}
.container { max-width: 960px; margin: 0 auto; }
h1 { font-size: 32px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 4px; }
h2 { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted); margin: 48px 0 12px; }
h3 { font-size: 18px; font-weight: 700; margin: 0 0 4px; }
p, li { color: var(--fg); }
.muted { color: var(--muted); }
.mono { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace; }
.kv { display: grid; grid-template-columns: 200px 1fr; gap: 8px 16px; font-size: 14px; }
.kv > .k { color: var(--muted); }
.kv > .v { font-weight: 600; }
.card { border: 1px solid var(--border); border-radius: 12px; padding: 24px; margin: 16px 0; background: var(--card); }
.grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.metric { border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
.metric .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px; }
.metric .value { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; }
.metric .sub { color: var(--muted); font-size: 12px; margin-top: 4px; }
.tag { display: inline-block; border: 1px solid var(--border); border-radius: 999px; padding: 2px 10px; font-size: 12px; font-weight: 600; background: #fff; }
.tag-cache { background: #f4f4f5; }
.tag-dyn { background: #fff; border-style: dashed; }
.row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.score-bar { height: 8px; background: var(--border); border-radius: 999px; overflow: hidden; }
.score-bar > .fill { height: 100%; background: var(--fg); }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { padding: 12px 8px; text-align: left; border-bottom: 1px solid var(--border); }
th { color: var(--muted); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
.finding { border: 1px solid var(--border); border-radius: 10px; padding: 16px; margin: 10px 0; background: #fff; }
.finding h4 { margin: 0 0 4px; font-size: 15px; font-weight: 700; }
.finding .evidence { color: var(--muted); font-size: 13px; margin: 8px 0 0; }
.finding .rec { color: var(--fg); font-size: 13px; margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border); }
.sev { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
.sev-low { background: #f4f4f5; color: var(--muted); }
.sev-medium { background: #fef3c7; color: var(--warn); }
.sev-high { background: #fee2e2; color: var(--bad); }
.sev-critical { background: var(--critical); color: #fff; }
.box { border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace; font-size: 12.5px; line-height: 1.6; }
.box .head { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted); margin-bottom: 8px; }
.box .line { padding: 2px 0; }
.box .cached { background: #f4f4f5; }
.fix { padding: 10px 14px; border-left: 3px solid var(--fg); margin: 6px 0; background: var(--card); }
.waste { font-size: 40px; font-weight: 800; color: var(--bad); letter-spacing: -0.03em; }
.header { border-bottom: 1px solid var(--border); padding-bottom: 24px; margin-bottom: 24px; }
.footer { border-top: 1px solid var(--border); margin-top: 48px; padding-top: 24px; color: var(--muted); font-size: 12px; }
.support-card { border: 1px solid var(--border); border-radius: 12px; padding: 28px 24px; margin: 48px 0 0; background: var(--card); }
.support-card .heart { color: var(--bad); font-weight: 700; }
.support-card .lead { font-size: 15px; margin: 0 0 20px; color: var(--fg); }
.support-steps { list-style: none; padding: 0; margin: 0; counter-reset: supportstep; }
.support-steps li { counter-increment: supportstep; display: grid; grid-template-columns: 28px 1fr; gap: 12px; align-items: start; padding: 10px 0; border-top: 1px dashed var(--border); }
.support-steps li:first-child { border-top: 0; }
.support-steps li::before { content: counter(supportstep); display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 999px; background: var(--fg); color: #fff; font-size: 12px; font-weight: 700; margin-top: 2px; }
.support-steps .step-title { font-weight: 600; font-size: 14px; margin: 0 0 4px; }
.support-steps .step-cmd { display: block; font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace; font-size: 12.5px; background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; color: var(--fg); white-space: nowrap; overflow-x: auto; }
.support-card .thanks { margin: 20px 0 0; font-size: 13px; color: var(--muted); }
`

  const findings = report.findings
  const dq = report.dataQuality
  const rate = report.summary.observedCacheReadRate

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escape(report.projectName)} — ${escape(APP_NAME)} Audit</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>${css}</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>${escape(APP_NAME)} <span class="muted" style="font-weight:500">v${escape(APP_VERSION)}</span></h1>
    <p class="muted">Cache Audit Report · ${escape(new Date(report.createdAt).toLocaleString())}</p>
    <div class="kv" style="margin-top: 16px;">
      <div class="k">Project</div><div class="v">${escape(report.projectName)}</div>
      <div class="k">Provider</div><div class="v">${escape(PROVIDER_LABELS[report.source] || report.source)}</div>
      <div class="k">Window</div><div class="v">${escape(WINDOW_LABELS[report.window] || report.window)}</div>
      <div class="k">Runs analyzed</div><div class="v">${formatNumber(report.summary.runsAnalyzed)}</div>
      <div class="k">Routes analyzed</div><div class="v">${report.summary.routesAnalyzed}</div>
      <div class="k">Confidence</div><div class="v">${escape(report.confidence.toUpperCase())}</div>
    </div>
  </div>

  <h2>Score</h2>
  <div class="card">
    <div class="row" style="margin-bottom: 12px;">
      <div style="font-size: 56px; font-weight: 800; letter-spacing: -0.03em;">${report.score}</div>
      <div class="muted" style="align-self: flex-end; padding-bottom: 12px;">/ 100</div>
    </div>
    <div class="score-bar"><div class="fill" style="width: ${report.score}%"></div></div>
  </div>

  <h2>Executive Summary</h2>
  <div class="grid-3">
    <div class="metric">
      <div class="label">Observed Cache Read</div>
      <div class="value">${rate === null ? "—" : formatPercent(rate)}</div>
      <div class="sub">${rate === null ? "no telemetry reported" : "of total input tokens"}</div>
    </div>
    <div class="metric">
      <div class="label">Est. Reusable Tokens</div>
      <div class="value">${formatTokensShort(report.summary.estimatedCacheOpportunityTokens)}</div>
      <div class="sub">across the analyzed window</div>
    </div>
    <div class="metric">
      <div class="label">Top Breaker</div>
      <div class="value" style="font-size: 16px; line-height: 1.4;">${escape(report.summary.topBreaker)}</div>
    </div>
  </div>
  <div class="card" style="text-align: center; margin-top: 16px;">
    <div class="muted" style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;">Estimated Monthly Waste</div>
    <div class="waste">${formatUsd(report.summary.estimatedMonthlyWasteUsd)}</div>
  </div>

  <h2>Route Diagnostics</h2>
  <table>
    <thead>
      <tr>
        <th>Route</th>
        <th>Model</th>
        <th>Cache Read</th>
        <th>First Div.</th>
        <th>Monthly Waste</th>
        <th>Top Breaker</th>
      </tr>
    </thead>
    <tbody>
      ${report.routes
        .map(
          (r) => `<tr>
        <td><strong>${escape(r.route)}</strong></td>
        <td class="muted">${escape(r.model || "—")}</td>
        <td>${r.observedCacheReadRate === null ? "—" : formatPercent(r.observedCacheReadRate)}</td>
        <td>${formatTokensShort(r.avgFirstDivergenceToken)}</td>
        <td><strong>${formatUsd(r.estimatedMonthlyWasteUsd)}</strong></td>
        <td class="muted">${escape((r.findings[0] && r.findings[0].title) || "—")}</td>
      </tr>`
        )
        .join("\n")}
    </tbody>
  </table>

  <h2>Optimized Prompt Structure</h2>
  <div class="grid">
    <div class="box">
      <div class="head">❌ Current (Dynamic Spread)</div>
      <div class="line">— Dynamic variables (UUIDs, timestamps)</div>
      <div class="line">— User / session metadata</div>
      <div class="line">— RAG / retrieved chunks</div>
      <div class="line">— System prompt</div>
      <div class="line">— Tool definitions</div>
      <div class="line">— User query</div>
    </div>
    <div class="box">
      <div class="head">✅ Cache-Optimized (Reorder)</div>
      ${report.recommendedLayout.stablePrefix
        .map((l) => `<div class="line cached">${escape(l)} 🔒</div>`)
        .join("\n      ")}
      <div class="line" style="border-top: 1px dashed var(--border); margin-top: 6px; padding-top: 6px;">— — —</div>
      ${report.recommendedLayout.dynamicTail
        .map((l) => `<div class="line">${escape(l)} 🌊</div>`)
        .join("\n      ")}
    </div>
  </div>

  <h2>Findings</h2>
  ${findings.length === 0 ? '<p class="muted">No findings — your prompt cache looks clean. 🎉</p>' : ""}
  ${findings
    .map(
      (f: CacheFinding) => `<div class="finding">
    <div class="row" style="margin-bottom: 4px;">
      <span class="sev ${severityClass(f.severity)}">${f.severity}</span>
      <span class="tag">${escape(CACHE_BREAKER_LABELS[f.type] || f.type)}</span>
      <span class="muted" style="font-size: 12px;">${escape(f.route)}</span>
    </div>
    <h4>${escape(f.title)}</h4>
    <p class="evidence">${escape(f.evidence)}</p>
    <div class="rec"><strong>Fix:</strong> ${escape(f.recommendation)}</div>
  </div>`
    )
    .join("\n")}

  ${report.rebuilds && report.rebuilds.length > 0 ? `<h2>Per-Route Prompt Rebuild</h2>
  <p class="muted">Concrete, route-specific rebuild plans derived from the actual divergence position in your prompts. Each block shows what to move, the cache contract for the model, and an example diff from two comparable traces (when available).</p>
  ${report.rebuilds
    .map(
      (rebuild, i) => {
        const advice = report.advice?.[i]
        return `<div class="card" style="margin-top: 12px;">
    <h3 style="margin-bottom: 4px;">${escape(rebuild.route)}</h3>
    ${advice ? `<p class="muted" style="margin: 0 0 12px;">${escape(advice.oneLiner)}</p>` : ""}
    <div class="grid">
      <div class="box">
        <div class="head">Move these to the dynamic tail</div>
        ${
          rebuild.fieldsToMoveDown.length === 0
            ? `<div class="line muted">No dynamic fields detected in the stable prefix.</div>`
            : rebuild.fieldsToMoveDown
                .map(
                  (f) => `<div class="line">— <code>${escape(f.firstSeen)}</code> <span class="muted">at char ${f.currentChar}</span></div>`
                )
                .join("\n        ")
        }
      </div>
      <div class="box">
        <div class="head">Stable header (render first, byte-stable)</div>
        ${rebuild.stableHeader
          .map((h) => `<div class="line cached">${escape(h)} 🔒</div>`)
          .join("\n        ")}
        ${
          rebuild.cacheContractNote
            ? `<div class="line" style="margin-top: 8px;"><strong>Cache contract:</strong> ${escape(rebuild.cacheContractNote)}</div>`
            : ""
        }
      </div>
    </div>
    ${
      rebuild.exampleDiff
        ? `<div class="grid" style="margin-top: 12px;">
        <div class="box">
          <div class="head">Before — ${escape(rebuild.exampleDiff.from.traceId)} at char ${rebuild.exampleDiff.from.char}</div>
          <div class="line"><code>${escape(rebuild.exampleDiff.from.slice)}</code></div>
        </div>
        <div class="box">
          <div class="head">After — ${escape(rebuild.exampleDiff.to.traceId)} at char ${rebuild.exampleDiff.to.char}</div>
          <div class="line"><code>${escape(rebuild.exampleDiff.to.slice)}</code></div>
        </div>
      </div>`
        : ""
    }
    ${
      advice
        ? `<div class="box" style="margin-top: 12px;">
        <div class="head">Agent Repair Instruction (paste as-is)</div>
        ${advice.agentInstruction
          .split("\n")
          .map((line) => `<div class="line">${escape(line)}</div>`)
          .join("\n        ")}
      </div>
      <div class="row" style="margin-top: 8px;">
        ${rebuild.expectedMonthlySavingsUsd !== null ? `<span class="tag">Recoverable: $${rebuild.expectedMonthlySavingsUsd.toFixed(0)}/mo</span>` : ""}
        <span class="tag">Expected post-fix cache-read: ${Math.round(rebuild.expectedCacheReadRateAfterFix * 100)}%</span>
      </div>`
        : ""
    }
  </div>`
      }
    )
    .join("\n")}` : ""}

  <h2>Fix Plan</h2>
  ${
    report.fixPlan.length === 0
      ? '<p class="muted">No fixes needed.</p>'
      : report.fixPlan.map((step) => `<div class="fix">${escape(step)}</div>`).join("\n")
  }

  <h2>Data Quality</h2>
  <div class="grid">
    <div class="card">
      <h3>Signals captured</h3>
      <ul style="margin: 0; padding-left: 18px;">
        <li>${dq.hasRenderedPrompts ? "✅" : "✗"} Rendered prompts</li>
        <li>${dq.hasTokenUsage ? "✅" : "✗"} Token usage</li>
        <li>${dq.hasCacheReadTelemetry ? "✅" : "✗"} Cache-read telemetry</li>
        <li>${dq.hasCacheCreationTelemetry ? "✅" : "✗"} Cache-creation telemetry</li>
        <li>${dq.hasProviderMetadata ? "✅" : "✗"} Provider metadata</li>
        <li>${dq.hasModelMetadata ? "✅" : "✗"} Model metadata</li>
      </ul>
    </div>
    <div class="card">
      <h3>${dq.comparableRunGroups} comparable route groups</h3>
      ${
        dq.warnings.length === 0
          ? '<p class="muted" style="margin: 0;">No warnings — clean signal.</p>'
          : dq.warnings.map((w) => `<p class="muted" style="margin: 4px 0;">⚠ ${escape(w)}</p>`).join("")
      }
    </div>
  </div>

  <div class="support-card">
    <p class="lead"><span class="heart">♥</span> This report helped you? Support the project by flexing your local agent report banner on X:</p>
    <ol class="support-steps">
      <li>
        <div>
          <p class="step-title">Run the local IDE agent report</p>
          <code class="step-cmd">npx --yes cachecatch@latest audit local --window 7d</code>
        </div>
      </li>
      <li>
        <div>
          <p class="step-title">Run share command to generate banner</p>
          <code class="step-cmd">npx --yes cachecatch@latest share</code>
        </div>
      </li>
      <li>
        <div>
          <p class="step-title">Share the banner on X</p>
        </div>
      </li>
    </ol>
    <p class="thanks">Thank you for choosing CacheCatch.</p>
  </div>

  <div class="footer">
    Generated by ${escape(APP_NAME)} v${escape(APP_VERSION)} · ${new Date(report.createdAt).toISOString()}<br />
    Run <code class="mono">npx --yes cachecatch audit --provider ${escape(report.source)} --project "${escape(report.projectName)}"</code> to refresh.
  </div>
</div>
</body>
</html>`
}

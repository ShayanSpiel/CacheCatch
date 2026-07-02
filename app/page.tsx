import type { Metadata } from "next"
import Image from "next/image"
import Script from "next/script"
import "../components/landing/landing.css"
import { sampleReport } from "@/lib/cachecatch/sample-data"
import { sampleLocalReport } from "@/lib/cachecatch/sample-local-data"
import { EmailCapture } from "@/components/landing/email-capture"
import { TerminalDemo } from "@/components/landing/terminal-demo"
import { FallingPattern } from "@/components/ui/falling-pattern"
import { ansiToHtml } from "@/src/reporting/ansi-html"
import {
  renderFounderSummary,
  renderHeader,
  renderMoneyMath,
  renderOptimizedPromptStructure,
  renderPersonalizedFixPlan,
  renderRouteDiagnostics,
  renderTopLeaksTable,
  renderCacheHealthScore,
  renderAgentRepairPrompt,
  renderValidationPlan,
  renderDataQuality,
  renderExportCommands,
  setTerminalWidth,
} from "@/src/reporting/terminal-report"
import { renderLocalAgentTerminalReport } from "@/src/reporting/local-terminal-report"
import {
  RiBarChartBoxFill,
  RiMoneyDollarCircleFill,
  RiShieldCheckFill,
  RiTimeFill,
} from "@/components/icons/remixicon"

const siteUrl = "https://cachecatch.spielos.xyz"
const demoPrompt = "npx cachecatch audit local --window 7d"
const localPrompt = "npx cachecatch audit local --window 7d"

const demoReportSections = (() => {
  setTerminalWidth(104)
  const report = sampleReport
  const sections = [
    renderHeader(report),
    renderFounderSummary(report),
    renderOptimizedPromptStructure(report),
    renderMoneyMath(report),
    renderCacheHealthScore(report),
    renderTopLeaksTable(report, 4, false),
    renderRouteDiagnostics(report, false),
    renderPersonalizedFixPlan(report),
    renderAgentRepairPrompt(report),
    renderValidationPlan(report),
    renderDataQuality(report),
    renderExportCommands(report),
  ]

  return sections.map((section) => ansiToHtml(section))
})()

const localReportSections = (() => {
  setTerminalWidth(104)
  const text = renderLocalAgentTerminalReport(sampleLocalReport)
  return text.split("\n\n").filter((s) => s.trim()).map((section) => ansiToHtml(section))
})()

const proofItems = [
  {
    icon: RiMoneyDollarCircleFill,
    value: "up to 90%",
    description: "lower cached input-token cost documented by OpenAI.",
  },
  {
    icon: RiTimeFill,
    value: "up to 80%",
    description: "lower latency possible when reusable prefixes hit cache.",
  },
  {
    icon: RiShieldCheckFill,
    value: "10%",
    description: "of standard input price for Anthropic cache-read tokens.",
  },
  {
    icon: RiBarChartBoxFill,
    value: "45-80%",
    description: "API cost reduction measured in a 2026 agentic prompt-caching evaluation.",
  },
]

export const metadata: Metadata = {
  title: "CACHECATCH — Prompt CacheOps for AI Teams",
  description:
    "CACHECATCH audits LLM traces from LangSmith, Langfuse, and Braintrust — plus local IDE agent sessions from Claude Code, Codex, and OpenCode. Detects prompt-cache breakers, estimates wasted spend, and gives exact prompt-layout fixes.",
  robots: "index, follow, max-image-preview:large",
  metadataBase: new URL(siteUrl),
  openGraph: {
    type: "website",
    title: "CACHECATCH — Find the token that kills cache",
    description: "Prompt-cache reports for AI teams — from cloud traces to local IDE agent sessions.",
    url: siteUrl,
    siteName: "CACHECATCH",
    images: [{ url: "/landing/og.png", width: 1731, height: 909, alt: "CACHECATCH prompt-cache report preview" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "CACHECATCH — Find the token that kills cache",
    description: "Audit AI traces and local IDE agent sessions, detect prompt-cache breakers, and get exact fixes.",
    images: ["/landing/og.png"],
  },
  other: {
    "application/ld+json": JSON.stringify({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "CACHECATCH",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "CLI",
      description:
        "Prompt-cache diagnosis for AI teams. CACHECATCH audits traces, detects prompt-cache breakers, estimates wasted spend, and produces exact prompt-layout fixes.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    }),
  },
}

function PostHogScript() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com"

  if (!key) return null

  return (
    <Script id="posthog-init" strategy="afterInteractive">
      {`
        !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags reloadFeatureFlags getFeatureFlag getFeatureFlagPayload group".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
        posthog.init(${JSON.stringify(key)}, { api_host: ${JSON.stringify(host)}, person_profiles: "identified_only", capture_pageview: true });
      `}
    </Script>
  )
}

export default function Landing() {
  return (
    <div className="landing-page">
      <PostHogScript />
      <header className="site-header">
        <div className="wrap nav">
          <a href="#top" className="brand" aria-label="CACHECATCH home">
            <span className="brand-word">CACHECATCH</span>
          </a>
          <nav className="nav-links" aria-label="Primary navigation">
            <a href="#demo">Demo</a>
            <a href="#proof">Proof</a>
            <a href="#report">Report</a>
            <a href="#cta">Get CLI</a>
          </nav>
        </div>
      </header>

      <main id="top">
        <section className="l-hero">
          <FallingPattern className="l-hero-pattern" color="#76f79c" duration={80} blurIntensity="0.35rem" density={2.2} />
          <div className="wrap hero-inner">
            <div className="eyebrow">SAVE UP TO 90% TOKEN COSTS!</div>
            <h1>
              Find the token<br />
              <span className="l-green">that kills cache.</span>
            </h1>
            <p className="subtitle">
              Whether you trace through LangSmith or run agents directly in your IDE — CACHECATCH turns runs and sessions into a cache-loss report: exact divergence, wasted spend, and the prompt fix your team should ship first.
            </p>

            <div className="provider-row" aria-label="Supported platforms">
              <span className="provider-pill">
                <Image className="provider-icon provider-icon-langsmith" src="/landing/icons/langsmith.svg" alt="" width={18} height={18} />
                LangSmith
              </span>
              <span className="provider-pill">
                <Image className="provider-icon provider-icon-langfuse" src="/landing/icons/langfuse.svg" alt="" width={18} height={18} />
                Langfuse
              </span>
              <span className="provider-pill">
                <Image className="provider-icon provider-icon-braintrust" src="/landing/icons/braintrust.svg" alt="" width={18} height={18} />
                Braintrust
              </span>
              <span className="provider-pill provider-pill-agents" aria-label="Local agents: Claude Code, Codex, OpenCode">
                <Image className="provider-icon provider-icon-claude" src="/landing/icons/claude.svg" alt="" width={18} height={18} />
                <Image className="provider-icon provider-icon-codex" src="/landing/icons/codex.svg" alt="" width={18} height={18} />
                <Image className="provider-icon provider-icon-opencode" src="/landing/icons/opencode.svg" alt="" width={18} height={18} />
                <span className="provider-pill-agents-label">Local Agents</span>
                <span className="provider-tooltip">
                  <span className="provider-tooltip-row">
                    <Image className="provider-tooltip-icon" src="/landing/icons/claude.svg" alt="" width={14} height={14} />
                    Claude Code
                  </span>
                  <span className="provider-tooltip-row">
                    <Image className="provider-tooltip-icon" src="/landing/icons/codex.svg" alt="" width={14} height={14} />
                    Codex
                  </span>
                  <span className="provider-tooltip-row">
                    <Image className="provider-tooltip-icon" src="/landing/icons/opencode.svg" alt="" width={14} height={14} />
                    OpenCode
                  </span>
                </span>
              </span>
            </div>

            <EmailCapture id="heroCta" />

            <a href="#demo" className="sample-link">
              View sample report
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </div>
        </section>

        <section id="demo" aria-labelledby="demo-title">
          <div className="wrap">
            <div className="section-head">
              <div className="kicker">Real CLI report</div>
              <h2 id="demo-title">
                A cache audit<br />
                <span className="l-green">engineers can act on.</span>
              </h2>
              <p className="section-copy">
                A fast CLI report that summarizes a sample audit — recoverable loss, the top leaking routes, the exact prefix break, and the prompt layout to ship next. Works with cloud traces and local IDE agent sessions alike.
              </p>
            </div>

            <TerminalDemo
              tabs={{
                agents: { sections: localReportSections, prompt: localPrompt },
                langsmith: { sections: demoReportSections, prompt: demoPrompt },
              }}
              defaultTab="agents"
            />
          </div>
        </section>

        <section id="banner" aria-labelledby="banner-title">
          <div className="wrap">
            <div className="section-head">
              <div className="kicker">Community cache reports</div>
              <h2 id="banner-title">
                Show the community<br />
                <span className="l-green">how efficient your agents are.</span>
              </h2>
              <p className="section-copy">
                Generate your own cache report card and share it on X. Let the community see how well your agentic sessions hit cache — or how much you could save with one prompt fix.
              </p>
            </div>

            <div className="banner-preview">
              <div className="banner-frame">
                <Image
                  src="/cachecatch-x-share.png"
                  alt="Sample CacheCatch X report card showing a cache leak score and recoverable savings"
                  width={1024}
                  height={732}
                  className="banner-image"
                  priority
                />
              </div>
              <div className="banner-cta">
                <EmailCapture id="bannerCta" />
              </div>
            </div>
          </div>
        </section>

        <section id="proof" aria-labelledby="proof-title">
          <div className="wrap">
            <div className="section-head">
              <div className="kicker">Why this matters</div>
              <h2 id="proof-title">
                Provider caching is real.<br />
                <span className="l-green">Your prompt order can still break it.</span>
              </h2>
              <p className="section-copy">
                OpenAI and Anthropic reward stable prefixes — whether you call them from cloud traces or local IDE agents. CACHECATCH shows exactly where your prompt stops being cacheable and what that costs.
              </p>
            </div>

            <div className="proof-grid">
              {proofItems.map((item) => {
                const Icon = item.icon
                return (
                  <article className="proof-card" key={item.value}>
                    <div className="icon-box" aria-hidden="true">
                      <Icon className="size-[18px]" />
                    </div>
                    <b>{item.value}</b>
                    <span>{item.description}</span>
                  </article>
                )
              })}
            </div>
            <p className="section-copy" style={{ fontSize: 11, marginTop: 18 }}>
              Sources: OpenAI prompt caching docs, Anthropic pricing docs, and the 2026 agentic prompt-caching evaluation.
            </p>
          </div>
        </section>

        <section id="report" aria-labelledby="report-title">
          <div className="wrap">
            <div className="section-head">
              <div className="kicker">What the report gives you</div>
              <h2 id="report-title">
                The missing layer<br />
                <span className="l-green">after tracing.</span>
              </h2>
              <p className="section-copy">
                Tracing tools show runs, latency, token usage, and cost. Local agents generate sessions but leave cache efficiency unseen. CACHECATCH turns both into the cache diagnosis your team can act on immediately.
              </p>
            </div>

            <div className="feature-grid">
              <article className="feature-card">
                <h3>
                  <span className="l-num">1</span>
                  Find the cache breaker
                </h3>
                <p>Request IDs, timestamps, user metadata, RAG blocks, tool schemas, and dynamic system prompts that appear before the stable prefix.</p>
              </article>
              <article className="feature-card">
                <h3>
                  <span className="l-num">2</span>
                  Rank routes by waste
                </h3>
                <p>Group repeated agent routes and show monthly waste, divergence depth, severity, evidence, and confidence per route.</p>
              </article>
              <article className="feature-card">
                <h3>
                  <span className="l-num">3</span>
                  Ship the fix plan
                </h3>
                <p>Move stable rules, tools, policy, and examples first. Push session metadata, user query, and tool outputs into the dynamic tail.</p>
              </article>
            </div>

            <div className="compare">
              <article className="mini-card">
                <h3>
                  <span className="l-dash" aria-hidden="true"></span>
                  Your tracing stack keeps
                </h3>
                <ul>
                  <li><span className="l-check-sm"><svg viewBox="0 0 16 16" fill="none"><path d="m4 8 3 3 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></span>traces, runs, and latency</li>
                  <li><span className="l-check-sm"><svg viewBox="0 0 16 16" fill="none"><path d="m4 8 3 3 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></span>token usage and model metadata</li>
                  <li><span className="l-check-sm"><svg viewBox="0 0 16 16" fill="none"><path d="m4 8 3 3 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></span>debugging context and observability</li>
                </ul>
              </article>
              <article className="mini-card highlight">
                <h3>
                  <span className="l-plus" aria-hidden="true">+</span>
                  CACHECATCH adds
                </h3>
                <ul>
                  <li><span className="l-check-sm accent"><svg viewBox="0 0 16 16" fill="none"><path d="m4 8 3 3 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></span>first divergence token</li>
                  <li><span className="l-check-sm accent"><svg viewBox="0 0 16 16" fill="none"><path d="m4 8 3 3 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></span>cache-specific waste estimate</li>
                  <li><span className="l-check-sm accent"><svg viewBox="0 0 16 16" fill="none"><path d="m4 8 3 3 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></span>exact prompt-layout fix plan</li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section id="cta" aria-labelledby="cta-title">
          <div className="wrap">
            <div className="final-panel">
              <div className="kicker">Run the audit</div>
              <h2 id="cta-title">
                Stop paying full price<br />
                <span className="l-green">for reusable context.</span>
              </h2>
              <p className="section-copy">
                Drop your email, grab the CLI, and run the audit on your local agent sessions or cloud traces in minutes.
              </p>
              <EmailCapture id="bottomCta" />
            </div>
          </div>
        </section>
      </main>

      <footer className="l-footer">
        <div className="wrap l-footer-inner">
          <span>CACHECATCH — prompt-cache diagnosis for AI teams. No stored prompts. No saved API keys.</span>
          <div className="l-footer-links" aria-label="Footer links">
            <a href="https://x.com/ShayanSpiel" target="_blank" rel="noreferrer noopener">@ShayanSpiel</a>
            <a href="https://spielos.xyz" target="_blank" rel="noreferrer noopener">spielos.xyz</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

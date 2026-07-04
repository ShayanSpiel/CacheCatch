import type { Metadata } from "next"
import Image from "next/image"
import { EmailCapture } from "@/components/landing/email-capture.backup"
import { TerminalDemo } from "@/components/landing/terminal-demo"
import { FallingPattern } from "@/components/ui/falling-pattern"
import {
  RiBarChartBoxFill,
  RiMoneyDollarCircleFill,
  RiShieldCheckFill,
  RiTimeFill,
} from "@/components/icons/remixicon"

import { hero, providers, demo, banner, proof, report, cta, footer, nav } from "@/content/landing/copy"
import { proofClaims, type ProofClaim } from "@/content/landing/proof-claims"
import { agentReportSections, agentReportPrompt } from "@/content/landing/sample-agent-report"
import { langsmithReportSections, langsmithReportPrompt } from "@/content/landing/sample-langsmith-report"

const iconMap = {
  "/landing/icons/trending-up.svg": RiMoneyDollarCircleFill,
  "/landing/icons/human-run.svg": RiTimeFill,
  "/landing/icons/percent.svg": RiShieldCheckFill,
  "/landing/icons/coin.svg": RiBarChartBoxFill,
} as const satisfies Record<ProofClaim["iconSrc"], typeof RiMoneyDollarCircleFill>

export const metadata: Metadata = {
  title: "CacheCatch — Prompt Cache Audit & Cost Optimization",
  description:
    "Audit LLM token costs and prompt-cache efficiency across LangSmith, Langfuse, Braintrust, and local IDE agents. CacheCatch detects cache breakers, estimates wasted spend, and gives exact prompt-layout fixes to cut AI costs up to 90%.",
}

export default function LandingEmailCaptureBackup() {
  return (
    <div className="landing-page">
      <header className="site-header">
        <div className="wrap nav">
          <a href="#top" className="brand" aria-label="CACHECATCH home">
            <span className="brand-word">CACHECATCH</span>
          </a>
          <nav className="nav-links" aria-label="Primary navigation">
            <a href="#demo">{nav.demo}</a>
            <a href="#proof">{nav.proof}</a>
            <a href="#report">{nav.report}</a>
            <a href="#cta">{nav.getCLI}</a>
          </nav>
          <a href="https://github.com/shayanspiel/cachecatch" target="_blank" rel="noopener noreferrer" className="nav-github">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            {nav.githubLabel}
          </a>
        </div>
      </header>

      <main id="top">
        <section className="l-hero">
          <FallingPattern className="l-hero-pattern" color="#76f79c" duration={80} blurIntensity="0.35rem" density={2.2} />
          <div className="wrap hero-inner">
            <div className="eyebrow">{hero.eyebrow}</div>
            <h1>
              {hero.headline.line1}<br />
              <span className="l-green">{hero.headline.line2}</span>
            </h1>
            <p className="subtitle">{hero.subtitle}</p>

            <div className="provider-row" aria-label="Supported platforms">
              <span className="provider-pill">
                <Image className="provider-icon provider-icon-langsmith" src="/landing/icons/langsmith.svg" alt="" width={18} height={18} />
                {providers.langsmith}
              </span>
              <span className="provider-pill">
                <Image className="provider-icon provider-icon-langfuse" src="/landing/icons/langfuse.svg" alt="" width={18} height={18} />
                {providers.langfuse}
              </span>
              <span className="provider-pill">
                <Image className="provider-icon provider-icon-braintrust" src="/landing/icons/braintrust.svg" alt="" width={18} height={18} />
                {providers.braintrust}
              </span>
              <span className="provider-pill provider-pill-agents" aria-label="Local agents: Claude Code, Codex, OpenCode">
                <Image className="provider-icon provider-icon-claude" src="/landing/icons/claude.svg" alt="" width={18} height={18} />
                <Image className="provider-icon provider-icon-codex" src="/landing/icons/codex.svg" alt="" width={18} height={18} />
                <Image className="provider-icon provider-icon-opencode" src="/landing/icons/opencode.svg" alt="" width={18} height={18} />
                <span className="provider-pill-agents-label">{providers.localAgents}</span>
              </span>
            </div>

            <EmailCapture id="heroCtaBackup" />

            <a href="#demo" className="sample-link">
              {hero.sampleLink} <span className="tri tri-down">▼</span>
            </a>
          </div>
        </section>

        <section id="demo" aria-labelledby="demo-title">
          <div className="wrap">
            <div className="section-head">
              <div className="kicker">{demo.kicker}</div>
              <h2 id="demo-title">
                {demo.headline.line1}<br />
                <span className="l-green">{demo.headline.line2}</span>
              </h2>
              <p className="section-copy">{demo.body}</p>
            </div>

            <TerminalDemo
              tabs={{
                agents: { sections: agentReportSections, prompt: agentReportPrompt },
                langsmith: { sections: langsmithReportSections, prompt: langsmithReportPrompt },
              }}
              defaultTab="agents"
            />
          </div>
        </section>

        <section id="banner" aria-labelledby="banner-title">
          <div className="wrap">
            <div className="section-head">
              <div className="kicker">{banner.kicker}</div>
              <h2 id="banner-title">
                {banner.headline.line1}<br />
                <span className="l-green">{banner.headline.line2}</span>
              </h2>
              <p className="section-copy">{banner.body}</p>
            </div>

            <div className="banner-preview">
              <div className="banner-cta-link">
                <span className="sample-link sample-link-static">
                  {banner.ctaLink} <span className="tri tri-down">▼</span>
                </span>
              </div>
              <div className="banner-cta">
                <EmailCapture id="bannerCtaBackup" />
              </div>
            </div>
          </div>
        </section>

        <section id="proof" aria-labelledby="proof-title">
          <div className="wrap">
            <div className="section-head">
              <div className="kicker">{proof.kicker}</div>
              <h2 id="proof-title">
                {proof.headline.line1}<br />
                <span className="l-green">{proof.headline.line2}</span>
              </h2>
              <p className="section-copy">{proof.body}</p>
            </div>

            <div className="proof-grid">
              {proofClaims.map((claim) => {
                const Icon = iconMap[claim.iconSrc as keyof typeof iconMap]
                return (
                  <article className="proof-card" key={claim.value}>
                    <div className="icon-box" aria-hidden="true">
                      <Icon className="size-[18px]" />
                    </div>
                    <b>{claim.value}</b>
                    <span>{claim.label}</span>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section id="report" aria-labelledby="report-title">
          <div className="wrap">
            <div className="section-head">
              <div className="kicker">{report.kicker}</div>
              <h2 id="report-title">
                {report.headline.line1}<br />
                <span className="l-green">{report.headline.line2}</span>
              </h2>
              <p className="section-copy">{report.body}</p>
            </div>
          </div>
        </section>

        <section id="cta" aria-labelledby="cta-title">
          <div className="wrap">
            <div className="final-panel">
              <div className="kicker">{cta.kicker}</div>
              <h2 id="cta-title">
                {cta.headline.line1}<br />
                <span className="l-green">{cta.headline.line2}</span>
              </h2>
              <p className="section-copy">Drop your email, grab the CLI, and run the audit on your local agent sessions or cloud traces in minutes.</p>
              <EmailCapture id="bottomCtaBackup" />
            </div>
          </div>
        </section>
      </main>

      <footer className="l-footer">
        <div className="wrap l-footer-inner">
          <span>{footer.tagline}</span>
          <div className="l-footer-links" aria-label="Footer links">
            {footer.links.map((link) => (
              <a key={link.href} href={link.href} target="_blank" rel="noreferrer noopener">{link.label}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}

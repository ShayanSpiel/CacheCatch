import type { Metadata } from "next"
import Image from "next/image"
import { LocalReportCli } from "@/components/landing/local-report-cli"
import { TerminalDemo } from "@/components/landing/terminal-demo"
import { FallingPattern } from "@/components/ui/falling-pattern"

import { hero, providers, demo, banner, proof, report, cta, footer, nav } from "@/content/landing/copy"
import { proofClaims } from "@/content/landing/proof-claims"
import { agentReportSections, agentReportPrompt } from "@/content/landing/sample-agent-report"
import { langsmithReportSections, langsmithReportPrompt } from "@/content/landing/sample-langsmith-report"

const siteUrl = "https://cachecatch.spielos.xyz"

export const metadata: Metadata = {
  title: "CacheCatch — Prompt Cache Audit & Cost Optimization",
  description:
    "Audit LLM token costs and prompt-cache efficiency across LangSmith, Langfuse, Braintrust, and local IDE agents. CacheCatch detects cache breakers, estimates wasted spend, and gives exact prompt-layout fixes to cut AI costs up to 90%.",
  robots: "index, follow, max-image-preview:large, max-snippet:-1",
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "CacheCatch",
    title: "CacheCatch — Prompt Cache Audit & Cost Optimization",
    description:
      "Audit LLM token costs and prompt-cache efficiency across LangSmith, Langfuse, Braintrust, and local IDE agents. Detects cache breakers and gives exact fixes to cut AI costs up to 90%.",
    url: siteUrl,
    images: [
      {
        url: "/landing/og.jpg",
        width: 1200,
        height: 630,
        alt: "CacheCatch prompt cache audit and cost optimization report preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CacheCatch — Prompt Cache Audit & Cost Optimization",
    description:
      "Audit LLM token costs and prompt-cache efficiency. Detects cache breakers and gives exact prompt-layout fixes to cut AI costs up to 90%.",
    images: ["/landing/og.jpg"],
  },
  other: {
    "application-name": "CacheCatch",
    "msapplication-TileColor": "#0c0f0d",
    "theme-color": "#0c0f0d",
  },
}

export default function Landing() {
  return (
    <div className="landing-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "CacheCatch",
            applicationCategory: "DeveloperApplication",
            operatingSystem: "CLI, Web",
            description:
              "Context cost audit and cache optimization platform for AI teams. CacheCatch audits LLM token costs, detects prompt-cache breakers across LangSmith, Langfuse, Braintrust, and local IDE agents, estimates wasted spend, and produces exact prompt-layout fixes to cut AI costs up to 90%.",
            url: siteUrl,
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            featureList: [
              "Token cost audit",
              "Prompt-cache breaker detection",
              "AI cost optimization",
              "Cache efficiency analysis",
              "Prompt-layout fix plans",
              "LangSmith trace audit",
              "Langfuse trace audit",
              "Braintrust trace audit",
              "Local IDE agent audit",
            ],
            applicationSuite: "CacheCatch",
            softwareVersion: "0.4.13",
            screenshot: `${siteUrl}/landing/og.jpg`,
          }),
        }}
      />
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
        {/* ─── Hero ──────────────────────────────────────────────── */}
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
                <span className="provider-tooltip">
                  {providers.tooltip.map((t) => (
                    <span className="provider-tooltip-row" key={t.name}>
                      <Image
                        className="provider-tooltip-icon"
                        src={`/landing/icons/${t.icon}`}
                        alt=""
                        width={14}
                        height={14}
                      />
                      {t.name}
                    </span>
                  ))}
                </span>
              </span>
            </div>

            <LocalReportCli id="heroCta" />

            <a href="#demo" className="sample-link">
              {hero.sampleLink} <Image className="tri tri-down" src="/landing/icons/chevron-down.svg" alt="" width={10} height={10} aria-hidden="true" />
            </a>
          </div>
        </section>

        {/* ─── Demo ──────────────────────────────────────────────── */}
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

        {/* ─── Banner / X post ───────────────────────────────────── */}
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
              <a href="https://x.com/ShayanSpiel/status/2073294968240705793?s=20" target="_blank" rel="noopener noreferrer" className="x-post">
                <div className="x-post-header">
                  <Image
                    src="/shayan-avatar.jpg"
                    alt={banner.xPost.name}
                    className="x-post-avatar"
                    width={40}
                    height={40}
                  />
                  <div className="x-post-user">
                    <span className="x-post-name">{banner.xPost.name} <svg className="x-verified" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z" /></svg></span>
                    <span className="x-post-handle">{banner.xPost.handle}</span>
                  </div>
                </div>
                <div className="x-post-body">
                  {banner.xPost.body.map((paragraph, i) => (
                    <p key={i}>{paragraph.split("\n").map((line, j, arr) => (
                      <span key={j}>
                        {line}
                        {j < arr.length - 1 && <br />}
                      </span>
                    ))}</p>
                  ))}
                </div>
                <div className="x-post-image">
                  <Image
                    src="/cachecatch-x-share.png"
                    alt={banner.xPost.imageAlt}
                    width={1024}
                    height={732}
                    className="banner-image"
                    priority
                  />
                </div>
                <div className="x-post-footer">
                  <span className="x-post-time">{banner.xPost.time}</span>
                </div>
              </a>
              <ol className="banner-steps" aria-label="How to share on X">
                <li>
                  <span className="l-num">1</span>
                  <span>Copy / Run CLI</span>
                </li>
                <li>
                  <span className="l-num">2</span>
                  <span>After report → <code>npx --yes cachecatch share</code></span>
                </li>
                <li>
                  <span className="l-num">3</span>
                  <span>Publish on 𝕏</span>
                </li>
              </ol>
              <div className="banner-cta-link">
                <span className="sample-link sample-link-static">
                  {banner.ctaLink} <Image className="tri tri-down" src="/landing/icons/chevron-down.svg" alt="" width={10} height={10} aria-hidden="true" />
                </span>
              </div>
              <div className="banner-cta">
                <LocalReportCli id="bannerCta" />
              </div>
            </div>
          </div>
        </section>

        {/* ─── Proof ─────────────────────────────────────────────── */}
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
                return (
                  <article className="proof-card" key={claim.value}>
                    <div className="icon-box" aria-hidden="true">
                      <Image src={claim.iconSrc} alt="" width={18} height={18} />
                    </div>
                    <b>{claim.value}</b>
                    <span>{claim.label}</span>
                  </article>
                )
              })}
            </div>
            <p className="section-copy" style={{ fontSize: 11, marginTop: 18 }}>
              {proof.sources}
            </p>
          </div>
        </section>

        {/* ─── Report features ───────────────────────────────────── */}
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

            <div className="feature-grid">
              {report.features.map((f) => (
                <article className="feature-card" key={f.num}>
                  <h3>
                    <span className="l-num">{f.num}</span>
                    {f.title}
                  </h3>
                  <p>{f.body}</p>
                </article>
              ))}
            </div>

            <div className="compare">
              <article className="mini-card">
                <h3>
                  <span className="l-dash" aria-hidden="true"></span>
                  {report.compare.tracingStack.title}
                </h3>
                <ul>
                  {report.compare.tracingStack.items.map((item) => (
                    <li key={item}><span className="l-check-sm"><svg viewBox="0 0 16 16" fill="none"><path d="m4 8 3 3 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></span>{item}</li>
                  ))}
                </ul>
              </article>
              <article className="mini-card highlight">
                <h3>
                  <span className="l-plus" aria-hidden="true">+</span>
                  {report.compare.cachecatch.title}
                </h3>
                <ul>
                  {report.compare.cachecatch.items.map((item) => (
                    <li key={item}><span className="l-check-sm accent"><svg viewBox="0 0 16 16" fill="none"><path d="m4 8 3 3 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></span>{item}</li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
        </section>

        {/* ─── CTA ───────────────────────────────────────────────── */}
        <section id="cta" aria-labelledby="cta-title">
          <div className="wrap">
            <div className="final-panel">
              <div className="kicker">{cta.kicker}</div>
              <h2 id="cta-title">
                {cta.headline.line1}<br />
                <span className="l-green">{cta.headline.line2}</span>
              </h2>
              <p className="section-copy">{cta.body}</p>
              <LocalReportCli id="bottomCta" />
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

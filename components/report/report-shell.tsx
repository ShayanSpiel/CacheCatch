import { CachecatchReport } from "@/lib/cachecatch/types"
import { ReportHeader } from "./report-header"
import { ScoreCard } from "./score-card"
import { MetricCard } from "./metric-card"
import { FindingsTable } from "./findings-table"
import { RouteBreakdown } from "./route-breakdown"
import { FixPlan } from "./fix-plan"
import { PromptLayout } from "./prompt-layout"
import { EvidenceCard } from "./evidence-card"
import { ReportActions } from "./report-actions"
import { ObservedVsEstimated } from "./observed-vs-estimated"
import { DataQualityCard } from "./data-quality-card"
import { buildCliCommand } from "@/lib/cachecatch/command"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CopyButton } from "@/components/shared/copy-button"
import {
  RiFlashlightLine,
  RiStackLine,
  RiGitBranchLine,
  RiFileList3Line,
  RiFileCheckLine,
  RiShieldCheckLine,
  RiLockLine,
  RiDatabase2Line,
  RiCheckboxCircleFill,
  RiAlertLine,
  RiErrorWarningLine,
  RiArrowRightLine,
  RiCloseCircleLine,
} from "@/components/icons/remixicon"

interface ReportShellProps {
  report: CachecatchReport
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

export function ReportShell({ report }: ReportShellProps) {
  const cliCommand = buildCliCommand(report.projectName, report.window)
  const hasCacheTelemetry = report.dataQuality.hasCacheReadTelemetry
  const fixPlanText = report.fixPlan.map((p, i) => `${i + 1}. ${p}`).join("\n")
  const qualityItems = [
    ["Rendered prompts", report.dataQuality.hasRenderedPrompts],
    ["Token usage", report.dataQuality.hasTokenUsage],
    ["Cache-read telemetry", report.dataQuality.hasCacheReadTelemetry],
    ["Provider metadata", report.dataQuality.hasProviderMetadata],
  ] as const

  const sampleEvidence = `BAD:
${report.findings.slice(0, 3).map((f) => `[${f.type}] ${f.evidence.slice(0, 120)}...`).join("\n")}

BETTER:
[system rules]
[tools sorted]
[policy]
[examples]
---
[request_id]
[timestamp]
[user query]
[tool outputs]`

  const avgDivergenceToken =
    report.routes.length > 0
      ? Math.round(
          report.routes.reduce((s, r) => s + r.avgFirstDivergenceToken, 0) /
            report.routes.length
        )
      : 0

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-7 lg:px-10">
          <Link href="/" className="flex items-center gap-3 no-underline">
            <span className="flex size-8 items-center justify-center rounded-md bg-foreground text-sm font-medium text-background">
              C
            </span>
            <span className="text-base font-medium tracking-tight text-foreground">
              Cachecatch
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/">Back to audit</Link>
            </Button>
            <CopyButton text={fixPlanText} label="Copy fix plan" />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-7 sm:px-7 sm:py-8 lg:px-10 lg:py-10">
        <div id="report-data" className="hidden">
          {JSON.stringify(report, null, 2)}
        </div>

        <div className="mb-5 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <RiFlashlightLine className="size-3" />
          Cachecatch / LangSmith / {report.projectName}
        </div>

        <ReportHeader
          projectName={report.projectName}
          window={report.window}
          createdAt={report.createdAt}
          confidence={report.confidence}
        />

        <div className="mt-5 rounded-xl border bg-card p-2 text-card-foreground shadow-xs">
          <ReportActions
            report={report}
            fixPlan={report.fixPlan}
            cliCommand={cliCommand}
          />
        </div>

        <div className="mt-5 grid gap-5 rounded-xl border bg-muted/40 p-5 sm:grid-cols-[minmax(0,1fr)_minmax(190px,240px)] sm:p-6">
          <div className="min-w-0">
            <Badge variant="secondary" className="mb-4 gap-1.5">
              <RiFlashlightLine className="size-3" />
              Main finding
            </Badge>
            <h2 className="font-heading text-balance text-2xl font-medium leading-tight tracking-tight text-foreground sm:text-4xl">
              Your stable context is sitting behind volatile metadata.
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground">
              LangSmith observed only{" "}
              <strong className="font-medium text-foreground">
                {hasCacheTelemetry
                  ? `${(report.summary.observedCacheReadRate! * 100).toFixed(1)}%`
                  : "N/A"}{" "}
                cache reads
              </strong>
              , but Cachecatch found{" "}
              <strong className="font-medium text-foreground">
                {formatTokens(report.summary.estimatedCacheOpportunityTokens)} tokens/month
              </strong>{" "}
              of estimated reusable context after early prompt divergence. The
              biggest route breaks at token{" "}
              <strong className="font-medium text-foreground">
                {avgDivergenceToken || "N/A"}
              </strong>
              .
            </p>
          </div>
          <div className="flex min-w-0 flex-col items-start justify-center rounded-lg border bg-card p-5 text-card-foreground sm:items-end sm:text-right">
            <span className="font-heading text-4xl font-medium tracking-tighter tabular-nums text-foreground sm:text-5xl">
              ${report.summary.estimatedMonthlyWasteUsd.toLocaleString()}
            </span>
            <span className="mt-2 max-w-44 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
              estimated avoidable waste / month
            </span>
          </div>
        </div>

        <div className="mt-5 grid auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <ScoreCard
            score={report.score}
            confidence={report.confidence}
            hasCacheTelemetry={hasCacheTelemetry}
          />
          <MetricCard
            label="Observed cache read"
            value={
              hasCacheTelemetry
                ? `${(report.summary.observedCacheReadRate! * 100).toFixed(1)}%`
                : "N/A"
            }
            subtext="Real telemetry from LangSmith"
          />
          <MetricCard
            label="Estimated opportunity"
            value={`${formatTokens(report.summary.estimatedCacheOpportunityTokens)}`}
            subtext="Reusable tokens/mo after divergence"
          />
          <MetricCard
            label="First divergence"
            value={avgDivergenceToken ? `${avgDivergenceToken}` : "N/A"}
            subtext="Token where largest route goes cold"
          />
          <MetricCard
            label="Waste / month"
            value={`$${(report.summary.estimatedMonthlyWasteUsd / 1000).toFixed(1)}k`}
            subtext="Avoidable spend estimate"
          />
        </div>

        <div className="mt-5 rounded-xl border bg-card p-4 text-card-foreground shadow-xs sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <Badge variant="secondary" className="mb-3 gap-1.5">
                {report.dataQuality.warnings.length > 0 ? (
                  <RiAlertLine className="size-3" />
                ) : (
                  <RiCheckboxCircleFill className="size-3" />
                )}
                Audit quality
              </Badge>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {report.dataQuality.hasCacheReadTelemetry
                  ? "Cache telemetry is present, so observed and estimated values can be separated clearly."
                  : "Cache-read telemetry is missing, so the report marks observed cache reads as unavailable and relies on prefix-drift estimates."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 lg:max-w-md lg:justify-end">
              {qualityItems.map(([label, ok]) => (
                <Badge
                  key={label}
                  variant={ok ? "secondary" : "destructive"}
                  className="gap-1.5"
                >
                  {ok ? (
                    <RiCheckboxCircleFill className="size-3" />
                  ) : (
                    <RiCloseCircleLine className="size-3" />
                  )}
                  {label}
                </Badge>
              ))}
            </div>
          </div>
          {(report.dataQuality.warnings.length > 0 ||
            report.dataQuality.confidenceReasons.length > 0) && (
            <div className="mt-5 border-t pt-5">
              <DataQualityCard dataQuality={report.dataQuality} />
            </div>
          )}
        </div>

        <div className="mt-8 rounded-lg border bg-card px-4 py-3 text-sm font-medium leading-relaxed text-card-foreground">
          {hasCacheTelemetry
            ? `LangSmith observed only ${(report.summary.observedCacheReadRate! * 100).toFixed(1)}% cache reads, but Cachecatch found ${formatTokens(report.summary.estimatedCacheOpportunityTokens)}/month of estimated reusable context sitting after early dynamic fields.`
            : `LangSmith did not report cache-read telemetry. Cachecatch estimated ${formatTokens(report.summary.estimatedCacheOpportunityTokens)}/month of reusable context based on prefix-drift analysis.`}
        </div>

        <div className="mt-10 space-y-10">
          <section>
            <div className="mb-6">
              <span className="mb-2 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <RiDatabase2Line className="size-3.5" />
                Telemetry
              </span>
              <h2 className="font-heading text-balance text-[clamp(24px,3vw,36px)] font-medium leading-tight tracking-tight text-foreground">
                Observed vs Estimated
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
                Observed metrics come from LangSmith / provider telemetry. Estimated opportunity comes from Cachecatch&rsquo;s deterministic prompt-prefix analysis.
              </p>
            </div>
            <ObservedVsEstimated
              observedCacheReadTokens={report.summary.observedCacheReadTokens}
              observedCacheCreationTokens={report.summary.observedCacheCreationTokens}
              observedInputTokens={report.summary.observedInputTokens}
              observedOutputTokens={report.summary.observedOutputTokens}
              observedCacheReadRate={report.summary.observedCacheReadRate}
              estimatedFirstDivergenceToken={avgDivergenceToken}
              estimatedReusableTokensAfterDivergence={
                report.summary.estimatedReusableTokensAfterDivergence
              }
              estimatedCacheOpportunityTokens={
                report.summary.estimatedCacheOpportunityTokens
              }
              estimatedMonthlyWasteUsd={report.summary.estimatedMonthlyWasteUsd}
            />
            {hasCacheTelemetry &&
              report.summary.observedCacheReadRate !== null &&
              report.summary.observedCacheReadRate < 0.15 && (
                <Alert variant="destructive" className="mt-4">
                  <RiErrorWarningLine />
                  <AlertDescription>
                    <strong>Cache-read rate is critically low (
                    {((report.summary.observedCacheReadRate) * 100).toFixed(
                      1
                    )}
                    %).</strong> Less than 15% of prompts reuse cached context,
                    meaning most runs pay full price for identical prefix
                    content. Prioritise the fix plan below.
                  </AlertDescription>
                </Alert>
              )}
          </section>

          <section>
            <div className="mb-6">
              <span className="mb-2 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <RiStackLine className="size-3.5" />
                Findings
              </span>
              <h2 className="font-heading text-balance text-[clamp(24px,3vw,36px)] font-medium leading-tight tracking-tight text-foreground">
                Top cache breakers
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
                The highest-impact findings across comparable LangSmith routes.
              </p>
            </div>
            <FindingsTable findings={report.findings} />
            {report.findings.some(
              (f) => f.severity === "critical" || f.severity === "high"
            ) && (
              <Alert className="mt-4">
                <RiAlertLine />
                <AlertDescription>
                  <strong>
                    {
                      report.findings.filter(
                        (f) => f.severity === "critical" || f.severity === "high"
                      ).length
                    }{" "}
                    findings
                  </strong>{" "}
                  are flagged critical or high. Each one represents a structural
                  prompt-assembly issue that blocks cache reuse across multiple
                  routes.
                </AlertDescription>
              </Alert>
            )}
          </section>

          <section>
            <div className="mb-6">
              <span className="mb-2 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <RiGitBranchLine className="size-3.5" />
                Routes
              </span>
              <h2 className="font-heading text-balance text-[clamp(24px,3vw,36px)] font-medium leading-tight tracking-tight text-foreground">
                Route breakdown
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
                Route-level cache waste makes the fix plan operational.
              </p>
            </div>
            <RouteBreakdown routes={report.routes} />
            {report.routes.some((r) => r.estimatedMonthlyWasteUsd > 500) && (
              <Alert variant="destructive" className="mt-4">
                <RiErrorWarningLine />
                <AlertDescription>
                  <strong>
                    {
                      report.routes.filter(
                        (r) => r.estimatedMonthlyWasteUsd > 500
                      ).length
                    }{" "}
                    routes
                  </strong>{" "}
                  each waste more than $500/mo. Focus the fix plan on these
                  high-leverage routes first.
                </AlertDescription>
              </Alert>
            )}
          </section>

          <section>
            <div className="mb-6">
              <span className="mb-2 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <RiFileList3Line className="size-3.5" />
                Layout
              </span>
              <h2 className="font-heading text-balance text-[clamp(24px,3vw,36px)] font-medium leading-tight tracking-tight text-foreground">
                Why the cache is cold
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
                Same information. Better order. Stable prefix first, dynamic tail last.
              </p>
            </div>
            <PromptLayout
              stablePrefix={report.recommendedLayout.stablePrefix}
              dynamicTail={report.recommendedLayout.dynamicTail}
            />
            <Alert className="mt-4">
              <RiCheckboxCircleFill />
              <AlertDescription>
                <strong>
                  Fix applied correctly, this single layout change
                </strong>{" "}
                would move {formatTokens(report.summary.estimatedCacheOpportunityTokens)} of
                reusable tokens per month into the cacheable prefix, recovering an
                estimated{" "}
                <strong>${report.summary.estimatedMonthlyWasteUsd.toLocaleString()}/mo</strong>.
              </AlertDescription>
            </Alert>
          </section>

          <section id="fix">
            <div className="mb-6">
              <span className="mb-2 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <RiFileCheckLine className="size-3.5" />
                Action
              </span>
              <h2 className="font-heading text-balance text-[clamp(24px,3vw,36px)] font-medium leading-tight tracking-tight text-foreground">
                Fix plan
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
                Ready for PR. Apply these before the next deploy, then rerun Cachecatch.
              </p>
            </div>
            <FixPlan plan={report.fixPlan} />
          </section>

          <section>
            <EvidenceCard evidence={sampleEvidence} />
          </section>
        </div>

        <div className="my-8 flex flex-wrap items-center gap-5 rounded-xl border bg-card px-5 py-4 text-xs font-medium text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <RiShieldCheckLine className="size-3.5" />
            Prompts are redacted
          </span>
          <span className="flex items-center gap-1.5">
            <RiLockLine className="size-3.5" />
            No API keys stored
          </span>
          <span className="flex items-center gap-1.5">
            <RiDatabase2Line className="size-3.5" />
            Observed vs estimated separated
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl bg-foreground px-8 py-14 text-center text-background sm:px-12 sm:py-16">
          <div className="mx-auto mb-6 inline-flex size-14 items-center justify-center rounded-full border border-background/10 bg-background/10 text-background">
            <RiCheckboxCircleFill className="size-6" />
          </div>
          <h3 className="mx-auto max-w-lg font-heading text-balance text-[clamp(28px,4vw,52px)] font-medium leading-[0.96] tracking-tighter text-background">
            Want this monitored on every deploy?
          </h3>
          <p className="mx-auto mt-4 max-w-md text-base font-medium leading-relaxed text-background/65">
            Cachecatch can become a CI guard that catches prompt-cache regressions before they reach production.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" className="gap-2">
              Join early access
              <RiArrowRightLine className="size-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-background/20 bg-transparent text-background hover:bg-background/10 hover:text-background"
            >
              Copy GitHub Action idea
            </Button>
            <Button
              asChild
              size="lg"
              variant="ghost"
              className="text-background/60 hover:bg-transparent hover:text-background"
            >
              <Link href="/">Back to audit</Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

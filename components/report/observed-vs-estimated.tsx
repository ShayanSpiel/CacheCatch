interface ObservedVsEstimatedProps {
  observedCacheReadTokens: number
  observedCacheCreationTokens: number
  observedInputTokens: number
  observedOutputTokens: number
  observedCacheReadRate: number | null
  estimatedFirstDivergenceToken: number
  estimatedReusableTokensAfterDivergence: number
  estimatedCacheOpportunityTokens: number
  estimatedMonthlyWasteUsd: number
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

export function ObservedVsEstimated({
  observedCacheReadTokens,
  observedCacheCreationTokens,
  observedInputTokens,
  observedOutputTokens,
  observedCacheReadRate,
  estimatedFirstDivergenceToken,
  estimatedReusableTokensAfterDivergence,
  estimatedCacheOpportunityTokens,
  estimatedMonthlyWasteUsd,
}: ObservedVsEstimatedProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl border bg-card p-4 text-card-foreground shadow-xs">
        <div className="mb-4 flex items-center gap-2">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border bg-card text-card-foreground">
            <RiDatabase2Line className="size-4" />
          </span>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Observed
            </div>
            <span className="text-xs text-muted-foreground">
              From LangSmith telemetry
            </span>
          </div>
        </div>
        <div className="space-y-2">
          <Row label="Input tokens" value={formatTokens(observedInputTokens)} />
          <Row label="Output tokens" value={formatTokens(observedOutputTokens)} />
          <Row
            label="Cache-read tokens"
            value={formatTokens(observedCacheReadTokens)}
          />
          <Row
            label="Cache-creation tokens"
            value={formatTokens(observedCacheCreationTokens)}
          />
          <Row
            label="Cache-read rate"
            value={
              observedCacheReadRate !== null
                ? `${(observedCacheReadRate * 100).toFixed(1)}%`
                : "Missing"
            }
            highlight
          />
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 text-card-foreground shadow-xs">
        <div className="mb-4 flex items-center gap-2">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border bg-card text-card-foreground">
            <RiFlashlightLine className="size-4" />
          </span>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Estimated
            </div>
            <span className="text-xs text-muted-foreground">
              From prefix-drift analysis
            </span>
          </div>
        </div>
        <div className="space-y-2">
          <Row
            label="First divergence"
            value={`token ${estimatedFirstDivergenceToken}`}
          />
          <Row
            label="Reusable after divergence"
            value={formatTokens(estimatedReusableTokensAfterDivergence)}
          />
          <Row
            label="Opportunity per month"
            value={`${formatTokens(estimatedCacheOpportunityTokens)}`}
          />
          <Row
            label="Estimated waste"
            value={`$${estimatedMonthlyWasteUsd.toLocaleString()}/mo`}
            highlight
          />
        </div>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div
      className={`flex justify-between text-sm ${
        highlight ? "border-t pt-2 mt-2" : ""
      }`}
    >
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`font-mono tabular-nums ${
          highlight
            ? "font-medium text-foreground"
            : "font-medium text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  )
}

import { RiDatabase2Line, RiFlashlightLine } from "@/components/icons/remixicon"

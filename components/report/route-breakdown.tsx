import { RouteAudit } from "@/lib/cachecatch/types"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"

interface RouteBreakdownProps {
  routes: RouteAudit[]
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function CacheRateBadge({ rate }: { rate: number | null }) {
  const isHigh = rate !== null && rate > 0.15
  const isLow = rate !== null && rate <= 0.05

  return (
    <Badge variant={isHigh ? "secondary" : isLow ? "destructive" : "outline"}>
      <span
        className={`mr-1.5 size-1.5 rounded-full ${
          rate === null
            ? "bg-muted-foreground/40"
            : isHigh
              ? "bg-foreground"
              : isLow
                ? "bg-primary"
                : "bg-muted-foreground"
        }`}
      />
      {rate !== null ? `${(rate * 100).toFixed(1)}% cached` : "No cache telemetry"}
    </Badge>
  )
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1.5 font-heading text-lg font-medium tabular-nums text-foreground">
        {value}
      </div>
    </div>
  )
}

export function RouteBreakdown({ routes }: RouteBreakdownProps) {
  return (
    <div className="space-y-3">
      {routes.map((route) => (
        <div
          key={route.route}
          className="rounded-xl border bg-card p-4 text-card-foreground shadow-xs sm:p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h4 className="font-mono text-sm font-medium tracking-tight text-foreground">
                {route.route}
              </h4>
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                {route.model && <span>{route.model}</span>}
                {route.provider && (
                  <>
                    <span className="text-muted-foreground/40">|</span>
                    <span>{route.provider}</span>
                  </>
                )}
                <span className="text-muted-foreground/40">|</span>
                <span>{route.runsAnalyzed.toLocaleString()} runs</span>
              </div>
            </div>
            <CacheRateBadge rate={route.observedCacheReadRate} />
          </div>

          <div className="my-3.5 h-px bg-border" />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatBlock
              label="Observed cache reads"
              value={formatTokens(route.observedCacheReadTokens)}
            />
            <StatBlock
              label="Est. opportunity"
              value={`${formatTokens(route.estimatedCacheOpportunityTokens)}/mo`}
            />
            <StatBlock
              label="First divergence"
              value={`token ${route.avgFirstDivergenceToken}`}
            />
            <StatBlock
              label="Waste / mo"
              value={`$${route.estimatedMonthlyWasteUsd.toLocaleString()}`}
            />
          </div>

          {route.observedCacheReadRate !== null && (
            <div className="mt-3.5">
              <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Cache read rate</span>
                <span>{(route.observedCacheReadRate * 100).toFixed(1)}%</span>
              </div>
              <Progress value={route.observedCacheReadRate * 100} />
            </div>
          )}

          {route.findings.length > 0 && (
            <>
              <div className="my-3.5 h-px bg-border" />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Top evidence
                  </div>
                  {route.findings.slice(0, 2).map((f) => (
                    <div
                      key={f.id}
                      className="mb-1 flex items-start gap-2 text-xs text-foreground last:mb-0"
                    >
                      <span className="mt-1 block size-1 shrink-0 rounded-full bg-muted-foreground/30" />
                      <span className="line-clamp-1">{f.title}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Primary fix
                  </div>
                  {route.findings.slice(0, 1).map((f) => (
                    <div
                      key={f.id}
                      className="line-clamp-2 text-xs leading-relaxed text-muted-foreground"
                    >
                      {f.recommendation}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

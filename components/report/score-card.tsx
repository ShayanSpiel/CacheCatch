import type { Confidence } from "@/lib/cachecatch/types"
import { Badge } from "@/components/ui/badge"

interface ScoreCardProps {
  score: number
  confidence: Confidence
  hasCacheTelemetry: boolean
}

function ScoreLabel({ score }: { score: number }) {
  if (score >= 80) {
    return (
      <Badge variant="secondary" className="gap-1.5 bg-foreground/10 text-foreground/80">
        <span className="size-1.5 rounded-full bg-foreground" />
        Good
      </Badge>
    )
  }
  if (score >= 60) {
    return (
      <Badge variant="secondary" className="gap-1.5 bg-foreground/10 text-foreground/80">
        <span className="size-1.5 rounded-full bg-foreground/70" />
        Fair
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="gap-1.5 bg-foreground/10 text-foreground/80">
      <span className="size-1.5 rounded-full bg-primary" />
      {score >= 40 ? "Poor" : "Critical"}
    </Badge>
  )
}

export function ScoreCard({ score, confidence, hasCacheTelemetry }: ScoreCardProps) {
  const scoreLabel = hasCacheTelemetry
    ? "Cache Stability Score"
    : "Cache Opportunity Score"

  return (
    <div className="flex h-full min-w-0 flex-col justify-between overflow-hidden rounded-xl bg-foreground p-4 text-background">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-background/50">
            {scoreLabel}
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-heading text-5xl font-medium tracking-tighter tabular-nums text-background">
              {score}
            </span>
            <span className="text-sm font-medium text-background/45">/ 100</span>
          </div>
          <div className="mt-2.5">
            <ScoreLabel score={score} />
          </div>
        </div>
        <span className="rounded-full bg-background/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-background/60">
          <span className="text-background capitalize">{confidence}</span>
        </span>
      </div>
      <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-background/15">
        <div
          className="h-full origin-left rounded-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  )
}

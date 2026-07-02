interface MetricCardProps {
  label: string
  value: string
  subtext?: string
  className?: string
}

export function MetricCard({ label, value, subtext, className = "" }: MetricCardProps) {
  return (
    <div
      className={`flex h-full min-w-0 flex-col justify-between rounded-xl border bg-card p-4 text-card-foreground shadow-xs ${className}`}
    >
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-2.5 font-heading text-2xl font-medium tracking-tight tabular-nums text-foreground">
        {value}
      </div>
      {subtext && (
        <div className="mt-1.5 text-xs text-muted-foreground">{subtext}</div>
      )}
    </div>
  )
}

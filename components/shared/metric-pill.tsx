interface MetricPillProps {
  value: string
  label: string
}

export function MetricPill({ value, label }: MetricPillProps) {
  return (
    <div className="rounded-md border bg-card p-4 text-center text-card-foreground shadow-xs">
      <div className="text-2xl font-medium tracking-tight text-foreground">
        {value}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

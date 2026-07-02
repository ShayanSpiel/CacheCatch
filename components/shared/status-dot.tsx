interface StatusDotProps {
  status: "success" | "warning" | "error" | "neutral"
  className?: string
}

const dotColors: Record<string, string> = {
  success: "bg-primary",
  warning: "bg-muted-foreground",
  error: "bg-foreground/60",
  neutral: "bg-muted-foreground/30",
}

export function StatusDot({ status, className = "" }: StatusDotProps) {
  return (
    <span
      className={`inline-block size-2 rounded-full ${dotColors[status]} ${className}`}
    />
  )
}

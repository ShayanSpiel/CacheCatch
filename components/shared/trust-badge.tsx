import { RiShieldCheckLine } from "@/components/icons/remixicon"

interface TrustBadgeProps {
  children: React.ReactNode
}

export function TrustBadge({ children }: TrustBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <RiShieldCheckLine className="size-3.5" />
      {children}
    </span>
  )
}

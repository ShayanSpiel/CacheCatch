import {
  RiAlertLine,
  RiInformationLine,
  RiErrorWarningLine,
} from "@/components/icons/remixicon"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"

interface WarningCalloutProps {
  variant?: "warning" | "info" | "critical"
  title: string
  children: React.ReactNode
}

const icons = {
  warning: RiAlertLine,
  info: RiInformationLine,
  critical: RiErrorWarningLine,
}

export function WarningCallout({
  variant = "info",
  title,
  children,
}: WarningCalloutProps) {
  const Icon = icons[variant]
  const alertVariant = variant === "critical" ? "destructive" : "default"

  return (
    <Alert variant={alertVariant}>
      <Icon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}

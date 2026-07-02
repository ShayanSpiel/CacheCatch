import type { Confidence } from "@/lib/cachecatch/types"
import { Badge } from "@/components/ui/badge"
import { RiCheckboxCircleFill, RiAlertLine } from "@/components/icons/remixicon"

interface ReportHeaderProps {
  projectName: string
  window: string
  createdAt?: string
  confidence: Confidence
}

function confidenceLabel(confidence: Confidence): string {
  switch (confidence) {
    case "high":
      return "High confidence"
    case "medium":
      return "Medium confidence"
    case "low":
      return "Low confidence"
  }
}

export function ReportHeader({
  projectName,
  window,
  createdAt,
  confidence,
}: ReportHeaderProps) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge
            variant={confidence === "high" ? "default" : "secondary"}
            className="gap-1.5"
          >
            {confidence === "high" ? (
              <RiCheckboxCircleFill className="size-3" />
            ) : (
              <RiAlertLine className="size-3" />
            )}
            {confidenceLabel(confidence)}
          </Badge>
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Observed + estimated
          </span>
        </div>
        <h1 className="font-heading text-balance text-[clamp(36px,5vw,58px)] font-medium leading-[0.95] tracking-tighter text-foreground">
          Cache Audit Report
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Prompt-cache efficiency for{" "}
          <strong className="font-medium text-foreground">{projectName}</strong>.
          LangSmith observed low cache reads while Cachecatch found reusable
          context trapped after early dynamic fields.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Badge variant="secondary" className="gap-1.5 font-normal">
          <RiCalendarLine className="size-3" />
          Window: {window}
        </Badge>
        {createdAt && (
          <Badge variant="secondary" className="gap-1.5 font-normal">
            <RiTimeLine className="size-3" />
            {new Date(createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </Badge>
        )}
      </div>
    </div>
  )
}

import { RiCalendarLine, RiTimeLine } from "@/components/icons/remixicon"

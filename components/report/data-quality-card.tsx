import type { DataQuality } from "@/lib/cachecatch/types"
import { Badge } from "@/components/ui/badge"
import { RiCheckboxCircleFill, RiCloseCircleLine, RiAlertLine, RiInformationLine } from "@/components/icons/remixicon"

interface DataQualityCardProps {
  dataQuality: DataQuality
}

function QualityRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {ok ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
          <RiCheckboxCircleFill className="size-3.5" />
          Present
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/60">
          <RiCloseCircleLine className="size-3.5" />
          Missing
        </span>
      )}
    </div>
  )
}

export function DataQualityCard({ dataQuality }: DataQualityCardProps) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Data quality
        </h3>
        <Badge
          variant={dataQuality.hasCacheReadTelemetry ? "secondary" : "destructive"}
        >
          {dataQuality.hasCacheReadTelemetry
            ? "Cache telemetry present"
            : "Cache telemetry absent"}
        </Badge>
      </div>

      <div className="divide-y divide-border/50">
        <QualityRow label="Rendered prompts" ok={dataQuality.hasRenderedPrompts} />
        <QualityRow label="Token usage" ok={dataQuality.hasTokenUsage} />
        <QualityRow
          label="Cache-read telemetry"
          ok={dataQuality.hasCacheReadTelemetry}
        />
        <QualityRow
          label="Cache-creation telemetry"
          ok={dataQuality.hasCacheCreationTelemetry}
        />
        <QualityRow
          label="Provider metadata"
          ok={dataQuality.hasProviderMetadata}
        />
        <QualityRow label="Model metadata" ok={dataQuality.hasModelMetadata} />
        <div className="flex items-center justify-between py-2 text-sm">
          <span className="text-muted-foreground">Comparable route groups</span>
          <span className="font-mono text-sm font-medium text-foreground">
            {dataQuality.comparableRunGroups}
          </span>
        </div>
      </div>

      {dataQuality.warnings.length > 0 && (
        <div className="mt-4 space-y-1 border-t pt-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <RiAlertLine className="size-3.5" />
            Warnings
          </div>
          {dataQuality.warnings.map((w, i) => (
            <div
              key={i}
              className="mb-1 flex items-start gap-2 text-xs text-muted-foreground last:mb-0"
            >
              <span className="mt-1 block size-1 shrink-0 rounded-full bg-muted-foreground/30" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {dataQuality.confidenceReasons.length > 0 && (
        <div className="mt-4 space-y-1 border-t pt-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <RiInformationLine className="size-3.5" />
            Confidence reasons
          </div>
          {dataQuality.confidenceReasons.map((r, i) => (
            <div
              key={i}
              className="mb-1 flex items-start gap-2 text-xs text-muted-foreground last:mb-0"
            >
              <span className="mt-1 block size-1 shrink-0 rounded-full bg-foreground/35" />
              <span>{r}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

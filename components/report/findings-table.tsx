import { CacheFinding } from "@/lib/cachecatch/types"
import { Badge } from "@/components/ui/badge"
import { RiCloseCircleLine, RiAlertLine } from "@/components/icons/remixicon"

interface FindingsTableProps {
  findings: CacheFinding[]
}

const severityColors: Record<string, "destructive" | "outline" | "secondary" | "default"> = {
  critical: "destructive",
  high: "destructive",
  medium: "secondary",
  low: "outline",
}

function SeverityIcon({ sev }: { sev: string }) {
  if (sev === "critical") {
    return <RiCloseCircleLine className="size-3" />
  }
  if (sev === "high") {
    return <RiAlertLine className="size-3" />
  }
  return null
}

export function FindingsTable({ findings }: FindingsTableProps) {
  if (findings.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-xs">
        No cache breakers detected.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted">
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Type
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Basis
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Severity
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Route
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Evidence
              </th>
              <th className="hidden px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground sm:table-cell">
                Fix
              </th>
            </tr>
          </thead>
          <tbody>
            {findings.map((finding) => (
              <tr
                key={finding.id}
                className="group border-b transition-colors last:border-0 hover:bg-muted/50"
              >
                <td className="px-4 py-3 align-top">
                  <span className="font-mono text-xs font-medium tracking-tight">
                    {finding.type.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-3 py-3 align-top">
                  <Badge
                    variant={
                      finding.basis === "observed"
                        ? "secondary"
                        : finding.basis === "estimated"
                          ? "outline"
                          : "default"
                    }
                    className="text-xs"
                  >
                    {finding.basis === "observed"
                      ? "Observed"
                      : finding.basis === "estimated"
                        ? "Estimated"
                        : finding.basis === "data_quality"
                          ? "Data Quality"
                          : finding.basis}
                  </Badge>
                </td>
                <td className="px-3 py-3 align-top">
                  <Badge
                    variant={severityColors[finding.severity] || "outline"}
                    className="gap-1 text-xs"
                  >
                    <SeverityIcon sev={finding.severity} />
                    {finding.severity}
                  </Badge>
                </td>
                <td className="px-3 py-3 align-top">
                  <span
                    className="block max-w-[100px] truncate font-mono text-xs font-medium text-foreground"
                    title={finding.route}
                  >
                    {finding.route}
                  </span>
                </td>
                <td className="max-w-[220px] px-3 py-3 align-top">
                  <span className="line-clamp-2 text-sm font-medium text-foreground">
                    {finding.title}
                  </span>
                  <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">
                    {finding.evidence}
                  </span>
                </td>
                <td className="hidden max-w-[180px] px-4 py-3 align-top sm:table-cell">
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {finding.recommendation}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

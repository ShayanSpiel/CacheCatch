interface EvidenceCardProps {
  evidence: string
}

export function EvidenceCard({ evidence }: EvidenceCardProps) {
  return (
    <div className="rounded-xl border bg-card p-4 text-card-foreground shadow-xs sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border bg-card text-card-foreground">
          <RiCodeBoxLine className="size-4" />
        </span>
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Sanitized prompt pattern
        </h3>
      </div>
      <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs leading-relaxed text-foreground">
        <code>{evidence}</code>
      </pre>
      <p className="mt-3.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <RiShieldCheckLine className="size-3.5" />
        Prompts are redacted in report by default. No full prompts are stored.
      </p>
    </div>
  )
}

import { RiCodeBoxLine, RiShieldCheckLine } from "@/components/icons/remixicon"

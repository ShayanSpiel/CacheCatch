interface PromptLayoutProps {
  stablePrefix: string[]
  dynamicTail: string[]
}

export function PromptLayout({ stablePrefix, dynamicTail }: PromptLayoutProps) {
  const allItems = [
    ...stablePrefix.map((item) => ({ text: item, zone: "stable" as const })),
    ...dynamicTail.map((item) => ({ text: item, zone: "dynamic" as const })),
  ]

  return (
    <div className="rounded-xl border bg-card p-4 text-card-foreground shadow-xs sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border bg-card text-card-foreground">
          <RiFlashlightLine className="size-4" />
        </span>
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Recommended prompt layout
        </h3>
      </div>
      <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs leading-relaxed">
        <code>
          {allItems.map((item, i) => (
            <span key={i}>
              <span
                className={
                  item.zone === "stable"
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                }
              >
                {item.text}
              </span>
              {"\n"}
            </span>
          ))}
        </code>
      </pre>
      <div className="mt-3.5 flex flex-wrap gap-4 text-xs font-medium text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-foreground" />
          Stable prefix (cache-key)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-muted-foreground/35" />
          Dynamic tail (per-request)
        </span>
      </div>
    </div>
  )
}

import { RiFlashlightLine } from "@/components/icons/remixicon"

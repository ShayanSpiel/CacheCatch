import { Badge } from "@/components/ui/badge"

const coldItems = [
  "[request_id]",
  "[timestamp]",
  "[user metadata]",
  "[system rules]",
  "[tools]",
  "[policy docs]",
  "[user question]",
]

const warmItems = [
  "[system rules]",
  "[tools sorted]",
  "[policy docs]",
  "[examples]",
]

const warmTail = [
  "[request_id]",
  "[timestamp]",
  "[user question]",
  "[tool outputs]",
]

export function PromptComparison() {
  return (
    <section>
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-7 sm:py-20 lg:px-10 lg:py-24">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <span className="mb-4 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Prompt surgery
          </span>
          <h2 className="font-heading text-balance text-[clamp(28px,3.8vw,48px)] font-medium leading-[1.05] tracking-tighter text-foreground">
            Same words. Different order. Different bill.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Prompt caching rewards stable prefixes. Cachecatch shows where volatility sneaks above reusable context and makes the whole run cold.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-[1fr_24px_1fr] md:items-stretch">
          <div className="rounded-xl border bg-muted p-6 md:p-7">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Cold assembly
              </h3>
              <Badge variant="outline">breaks early</Badge>
            </div>
            <div className="mt-6 space-y-2.5">
              {coldItems.map((item) => (
                <div
                  key={item}
                  className="rounded-md border bg-card px-4 py-3 font-mono text-sm font-medium text-card-foreground"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="hidden w-px bg-border md:block" />

          <div className="overflow-hidden rounded-xl bg-foreground p-6 text-background md:p-7">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-medium uppercase tracking-wider text-background/60">
                Cacheable assembly
              </h3>
              <Badge className="bg-primary text-primary-foreground">stable prefix</Badge>
            </div>
            <div className="mt-6 space-y-2.5">
              {warmItems.map((item) => (
                <div
                  key={item}
                  className="rounded-md border border-background/15 bg-background/10 px-4 py-3 font-mono text-sm font-medium text-background"
                >
                  {item}
                </div>
              ))}
            </div>
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-background/25" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-background/50">
                dynamic tail
              </span>
              <div className="h-px flex-1 bg-background/25" />
            </div>
            <div className="space-y-2.5">
              {warmTail.map((item) => (
                <div
                  key={item}
                  className="rounded-md border border-background/10 px-4 py-3 font-mono text-sm font-medium text-background/55"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

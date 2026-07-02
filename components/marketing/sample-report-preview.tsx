import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { RiArrowRightLine, RiCodeLine } from "@/components/icons/remixicon"

export function SampleReportPreview() {
  return (
    <section>
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-7 sm:py-20 lg:px-10 lg:py-24">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <span className="mb-4 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Report experience
          </span>
          <h2 className="font-heading text-balance text-[clamp(28px,3.8vw,48px)] font-medium leading-[1.05] tracking-tighter text-foreground">
            Not a dashboard. A decision document.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
            The report opens with the financial leak, proves the prompt-order failure, ranks the affected routes, then ends with copy-ready fixes.
          </p>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
          <div className="overflow-hidden rounded-xl bg-card text-card-foreground shadow-xs ring-1 ring-foreground/10">
            <div className="grid gap-0 lg:grid-cols-[1fr_240px]">
              <div className="p-6 md:p-8">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Sample audit
                  </span>
                  <Badge variant="outline">High confidence</Badge>
                </div>
                <div className="mt-8 flex items-end gap-3">
                  <span className="font-heading text-4xl font-medium tracking-tighter tabular-nums text-foreground sm:text-5xl">
                    $3,840
                  </span>
                  <span className="pb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    / mo
                  </span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  avoidable prompt-cache waste from one route family
                </p>
                <div className="mt-8 space-y-3">
                  {([
                    ["Observed cache read", "6.8%"],
                    ["First break", "token 217"],
                    ["Reusable context", "82M tokens/mo"],
                  ] as const).map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between rounded-lg border bg-muted px-4 py-3"
                    >
                      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {label}
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t bg-muted p-6 lg:border-l lg:border-t-0">
                <div className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border bg-card text-card-foreground">
                  <RiCodeLine className="size-5" />
                </div>
                <h3 className="mt-6 font-heading text-2xl font-medium leading-tight tracking-tight text-foreground">
                  Fix-ready output.
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Move volatile metadata behind stable policy, sorted tools, examples, and reusable context. Rerun to verify.
                </p>
                <Progress value={80} className="mt-7" />
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-heading text-balance text-[clamp(28px,3.2vw,44px)] font-medium leading-[0.98] tracking-tighter text-foreground">
              Copy the fix.
              <br />
              Deploy. Rerun.
            </h3>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground md:text-lg">
              The report includes a numbered fix plan, the exact prompt layout to ship, and a CLI rerun command to verify cache recovery after deploy.
            </p>
            <Button asChild size="lg" className="mt-8 gap-2">
              <Link href="/report/sample">
                Open the sample report
                <RiArrowRightLine className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

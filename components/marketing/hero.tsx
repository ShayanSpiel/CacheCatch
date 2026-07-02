import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RiArrowRightLine } from "@/components/icons/remixicon"
import { AuditForm } from "./audit-form"

export function Hero() {
  return (
    <section>
      <div className="mx-auto max-w-7xl px-5 pt-20 pb-8 sm:px-7 md:pt-28 md:pb-10 lg:px-10">
        <div className="mx-auto max-w-3xl text-center">
          <Badge variant="secondary" className="mx-auto mb-6 w-fit">
            Prompt CacheOps for LangSmith
          </Badge>
          <h1 className="font-heading text-balance text-[clamp(40px,6vw,72px)] font-medium leading-[0.95] tracking-tighter text-foreground">
            Find the token
            <br />
            <span className="text-primary">that kills cache.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-base leading-relaxed text-muted-foreground md:text-lg">
            Cachecatch turns LangSmith traces into a focused cache-loss report: exact divergence, dollar impact, route priority, and the prompt layout your team should ship next.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <a href="#audit" className="gap-2">
                Run cache audit
                <RiArrowRightLine className="size-4" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/report/sample">View sample report</Link>
            </Button>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span>No prompt storage</span>
            <span aria-hidden="true">·</span>
            <span>Read-only API key</span>
            <span aria-hidden="true">·</span>
            <span>Provider-independent analysis</span>
          </div>
        </div>
      </div>

      <div className="border-y bg-muted/40">
        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-7 md:py-10 lg:px-10">
          <div id="audit" className="scroll-mt-20">
            <AuditForm />
          </div>
        </div>
      </div>
    </section>
  )
}

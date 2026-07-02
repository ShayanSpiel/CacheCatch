import Link from "next/link"
import { Button } from "@/components/ui/button"
import { RiArrowRightLine } from "@/components/icons/remixicon"

export function FinalCta() {
  return (
    <section className="bg-background">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-7 sm:py-20 lg:px-10 lg:py-24">
        <div className="rounded-2xl bg-foreground px-8 py-14 text-center text-background sm:px-16 sm:py-20">
          <h2 className="mx-auto max-w-3xl font-heading text-balance text-[clamp(32px,4.5vw,56px)] font-medium leading-[0.96] tracking-tighter text-background">
            Stop paying full price for reusable context.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-background/70 md:text-lg">
            Run the audit, open the report, copy the fix plan, and rerun after deploy to verify cache recovery.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="gap-2">
              <Link href="/#audit">
                Run cache audit
                <RiArrowRightLine className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-background/20 bg-transparent text-background hover:bg-background/10 hover:text-background"
            >
              <Link href="/report/sample">View sample report</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

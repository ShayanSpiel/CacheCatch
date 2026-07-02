import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const observed = [
  "Cache-read tokens",
  "Cache-creation tokens",
  "Input / output tokens",
  "Real costs if available",
]

const estimated = [
  "First divergence token",
  "Reusable tokens after divergence",
  "Prompt-layout fixes",
  "Confidence score",
]

export function ObservedVsEstimatedSection() {
  return (
    <section>
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-7 sm:py-20 lg:px-10 lg:py-24">
        <div className="mb-10 max-w-2xl">
          <span className="mb-4 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Telemetry
          </span>
          <h2 className="font-heading text-balance text-[clamp(28px,3.8vw,48px)] font-medium leading-[1.05] tracking-tighter text-foreground">
            Real telemetry. Deterministic opportunity. No fake cache math.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">
            Cachecatch does not pretend estimates are facts. Every report separates
            what LangSmith observed from what Cachecatch inferred.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Observed</CardTitle>
              <CardDescription>
                Comes from LangSmith / provider usage metadata
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {observed.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/30" />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Estimated</CardTitle>
              <CardDescription>
                Comes from Cachecatch prefix-diff analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-foreground">
                {estimated.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/50" />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  )
}

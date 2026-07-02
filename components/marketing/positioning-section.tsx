import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const observed = [
  "Cache-read telemetry from LangSmith/provider",
  "Real token and cost usage",
  "Provider / model metadata",
  "But does not explain cache misses",
]

const estimated = [
  "Deterministic prefix-drift analysis",
  "Confidence scoring per route",
  "Route-level fixes and prompt layout",
  "Clear separation from real telemetry",
]

export function PositioningSection() {
  return (
    <section>
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-7 sm:py-20 lg:px-10 lg:py-24">
        <div className="mb-10 max-w-2xl">
          <span className="mb-4 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Positioning
          </span>
          <h2 className="font-heading text-balance text-[clamp(28px,3.8vw,48px)] font-medium leading-[1.05] tracking-tighter text-foreground">
            What makes the report credible?
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Observed</CardTitle>
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

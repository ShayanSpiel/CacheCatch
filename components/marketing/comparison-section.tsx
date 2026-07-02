import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const langsmithRows = [
  { feature: "Traces", ls: true, cc: false },
  { feature: "Latency", ls: true, cc: false },
  { feature: "Token usage", ls: true, cc: false },
  { feature: "Cost tracking", ls: true, cc: false },
  { feature: "Run history", ls: true, cc: false },
  { feature: "Prompt-cache drift detection", ls: false, cc: true },
  { feature: "First divergence token", ls: false, cc: true },
  { feature: "Observed vs estimated cache gap", ls: false, cc: true },
  { feature: "Cache-specific money waste", ls: false, cc: true },
  { feature: "Prompt-layout fix plan", ls: false, cc: true },
]

export function ComparisonSection() {
  return (
    <section>
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-7 sm:py-20 lg:px-10 lg:py-24">
        <div className="mb-10 max-w-2xl">
          <span className="mb-4 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Comparison
          </span>
          <h2 className="font-heading text-balance text-[clamp(28px,3.8vw,48px)] font-medium leading-[1.05] tracking-tighter text-foreground">
            Built on top of LangSmith, not against it.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">
            LangSmith tells you what happened. Cachecatch tells you why your
            prompt cache missed and what to change.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Feature matrix</CardTitle>
            <CardDescription>
              What you keep in LangSmith, what Cachecatch adds.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-2 py-3 text-left font-medium text-muted-foreground">
                      Feature
                    </th>
                    <th className="px-2 py-3 text-center font-medium text-muted-foreground">
                      LangSmith
                    </th>
                    <th className="px-2 py-3 text-center font-medium text-muted-foreground">
                      Cachecatch
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {langsmithRows.map((row) => (
                    <tr key={row.feature} className="border-b last:border-0">
                      <td className="px-2 py-3 text-foreground">
                        {row.feature}
                      </td>
                      <td className="px-2 py-3 text-center">
                        {row.ls ? (
                          <Badge variant="secondary">Included</Badge>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="px-2 py-3 text-center">
                        {row.cc ? (
                          <Badge>Included</Badge>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

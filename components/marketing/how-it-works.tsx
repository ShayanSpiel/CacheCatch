import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  RiLinkM,
  RiDatabase2Line,
  RiGitCompareLine,
  RiFileSearchLine,
} from "@/components/icons/remixicon"

const steps = [
  {
    icon: RiLinkM,
    title: "Connect LangSmith",
    description:
      "Paste project URL and API key. Data is read once and never stored.",
  },
  {
    icon: RiDatabase2Line,
    title: "Fetch LLM runs",
    description: "Cachecatch reads only the run fields needed for the audit.",
  },
  {
    icon: RiGitCompareLine,
    title: "Compare prompt prefixes",
    description:
      "Routes are grouped and prompts are diffed to find first divergence.",
  },
  {
    icon: RiFileSearchLine,
    title: "Get exact fixes",
    description:
      "Move volatile metadata, sort tools, shift RAG blocks, and improve cache reuse.",
  },
]

export function HowItWorks() {
  return (
    <section>
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-7 sm:py-20 lg:px-10 lg:py-24">
        <div className="mb-10">
          <span className="mb-4 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            How it works
          </span>
          <h2 className="font-heading text-balance text-[clamp(28px,3.8vw,48px)] font-medium leading-[1.05] tracking-tighter text-foreground">
            Four steps to a copy-ready fix.
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => {
            const Icon = step.icon
            return (
              <Card key={step.title}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="inline-flex size-9 items-center justify-center rounded-md border bg-card text-card-foreground">
                      <Icon className="size-4 text-muted-foreground" />
                    </div>
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      0{i + 1}
                    </span>
                  </div>
                  <CardTitle>{step.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {step.description}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}

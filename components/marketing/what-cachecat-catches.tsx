import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  RiSnowflakeLine,
  RiGitCompareLine,
  RiMoneyDollarCircleLine,
} from "@/components/icons/remixicon"

const items = [
  {
    icon: RiSnowflakeLine,
    title: "Cold cached-token telemetry",
    description:
      "See observed cache-read rate from LangSmith and separate it from estimated opportunity.",
  },
  {
    icon: RiGitCompareLine,
    title: "Early prompt divergence",
    description:
      "Find the token where request IDs, timestamps, user metadata, or RAG blocks break the reusable prefix.",
  },
  {
    icon: RiMoneyDollarCircleLine,
    title: "Wasted LLM spend",
    description:
      "Estimate how much money is trapped behind avoidable prompt assembly drift.",
  },
]

export function WhatCachecatCatches() {
  return (
    <section>
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-7 sm:py-20 lg:px-10 lg:py-24">
        <div className="mb-10">
          <span className="mb-4 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            What we catch
          </span>
          <h2 className="font-heading text-balance text-[clamp(28px,3.8vw,48px)] font-medium leading-[1.05] tracking-tighter text-foreground">
            Three expensive failure modes.
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <Card key={item.title}>
                <CardHeader>
                  <Icon className="size-5 text-foreground" />
                  <CardTitle>{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{item.description}</CardDescription>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}

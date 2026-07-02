import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { RiEyeLine, RiMoneyDollarCircleLine, RiBarChartBoxLine } from "@/components/icons/remixicon"

const features = [
  {
    icon: RiEyeLine,
    title: "Detect early prompt drift",
    description:
      "Find timestamps, request IDs, and dynamic metadata that break the cache prefix before stable content.",
  },
  {
    icon: RiMoneyDollarCircleLine,
    title: "Estimate wasted cached-token opportunity",
    description:
      "See exactly how much you're overpaying because the prompt prefix doesn't reuse cache.",
  },
  {
    icon: RiBarChartBoxLine,
    title: "Get exact prompt-layout fixes",
    description:
      "Receive a precise stable prefix and dynamic tail layout to maximize cache hit rates.",
  },
]

export function SocialProofStrip() {
  return (
    <section>
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-7 sm:py-20 lg:px-10 lg:py-24">
        <div className="mb-10">
          <span className="mb-4 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            What you get
          </span>
          <h2 className="font-heading text-balance text-[clamp(28px,3.8vw,48px)] font-medium leading-[1.05] tracking-tighter text-foreground">
            The exact cache-leak diagnosis.
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <Card key={feature.title}>
                <CardHeader>
                  <Icon className="size-5 text-foreground" />
                  <CardTitle>{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{feature.description}</CardDescription>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}

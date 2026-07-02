const items = [
  {
    title: "Not evals",
    body: "Evals judge answer quality. Cachecatch explains why repeated context still bills cold.",
  },
  {
    title: "Not observability",
    body: "LangSmith shows traces and spend. Cachecatch turns them into the cache miss and the fix.",
  },
  {
    title: "Not semantic cache",
    body: "Semantic cache reuses answers. Cachecatch makes provider prefix caching pay off.",
  },
]

export function NotSection() {
  return (
    <section className="bg-background">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-7 sm:py-20 lg:px-10 lg:py-24">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <span className="mb-4 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            What we are not
          </span>
          <h2 className="font-heading text-balance text-[clamp(28px,3.8vw,48px)] font-medium leading-[1.05] tracking-tighter text-foreground">
            Narrow by design.
            <br />
            Useful on purpose.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Cachecatch owns one expensive failure mode: provider prompt caching looks enabled, but your prompt assembly prevents reuse.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {items.map(({ title, body }, index) => (
            <div
              key={title}
              className="flex min-h-[230px] flex-col justify-between rounded-xl border bg-card p-7 text-card-foreground shadow-xs"
            >
              <span className="font-mono text-xs font-medium text-muted-foreground">
                0{index + 1}
              </span>
              <div>
                <h3 className="font-heading text-[clamp(24px,3vw,32px)] font-medium leading-[0.98] tracking-tighter text-foreground">
                  {title}
                </h3>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground md:text-base">
                  {body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

import { CopyButton } from "@/components/shared/copy-button"

interface FixPlanProps {
  plan: string[]
}

export function FixPlan({ plan }: FixPlanProps) {
  const plainText = plan.map((p, i) => `${i + 1}. ${p}`).join("\n")

  return (
    <div className="rounded-xl border bg-card p-4 text-card-foreground shadow-xs sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Fix plan
        </h3>
        <CopyButton text={plainText} label="Copy plan" />
      </div>
      <div className="space-y-2">
        {plan.map((step, i) => (
          <div
            key={i}
            className="grid grid-cols-[34px_1fr] items-start gap-3 rounded-md border bg-card p-3"
          >
            <span className="pt-0.5 text-center font-mono text-[11px] font-medium leading-none text-muted-foreground">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="pt-0.5 text-sm leading-relaxed">
              <span className="text-[13px] font-medium text-foreground">
                {step}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

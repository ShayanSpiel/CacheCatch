"use client"

import * as React from "react"
import {
  RiCheckboxCircleFill,
  RiLoader4Line,
} from "@/components/icons/remixicon"

interface AuditProgressProps {
  currentStep: number
  error?: string | null
}

const steps = [
  { label: "Connecting to LangSmith", key: "connecting" },
  { label: "Fetching LLM runs", key: "fetching" },
  { label: "Grouping routes", key: "grouping" },
  { label: "Comparing prompt prefixes", key: "comparing" },
  { label: "Detecting cache breakers", key: "detecting" },
  { label: "Building report", key: "building" },
]

export function AuditProgress({ currentStep, error }: AuditProgressProps) {
  return (
    <div className="rounded-xl border bg-card p-5 text-card-foreground shadow-xs">
      <h3 className="mb-5 text-sm font-medium text-foreground">
        Running cache audit
      </h3>
      <div className="space-y-3">
        {steps.map((step, i) => {
          const isActive = i === currentStep
          const isDone = i < currentStep
          const isError = error && i === currentStep

          return (
            <div
              key={step.key}
              className={`flex items-center gap-3 text-sm font-medium ${
                isDone
                  ? "text-muted-foreground"
                  : isActive
                    ? "text-foreground"
                    : "text-muted-foreground/40"
              }`}
            >
              {isDone ? (
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                  <RiCheckboxCircleFill className="size-3" />
                </span>
              ) : isError ? (
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-destructive text-xs font-bold text-white">
                  !
                </span>
              ) : (
                <div className="flex size-5 shrink-0 items-center justify-center">
                  {isActive ? (
                    <RiLoader4Line className="size-4 animate-spin text-primary" />
                  ) : (
                    <span className="block size-2 rounded-full bg-border" />
                  )}
                </div>
              )}
              <span>{step.label}</span>
            </div>
          )
        })}
      </div>
      {error && (
        <div className="mt-4 rounded-lg border bg-card p-3 text-sm font-medium text-foreground">
          {error}
        </div>
      )}
      <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
          style={{
            width: `${Math.min(100, ((currentStep + 1) / steps.length) * 100)}%`,
          }}
        />
      </div>
    </div>
  )
}

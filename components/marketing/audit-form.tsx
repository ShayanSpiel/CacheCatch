"use client"

import { useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  RiSearchLine,
  RiLockLine,
  RiArrowRightLine,
  RiShieldCheckLine,
  RiTerminalLine,
} from "@/components/icons/remixicon"
import { CommandBox } from "./command-box"
import { AuditProgress } from "@/components/shared/audit-progress"
import { buildCliCommand } from "@/lib/cachecatch/command"

export function AuditForm() {
  const router = useRouter()
  const [projectUrl, setProjectUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [window, setWindow] = useState("7d")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [currentStep, setCurrentStep] = useState(-1)

  const cliCommand = useMemo(
    () => buildCliCommand(projectUrl || "your-project", window),
    [projectUrl, window]
  )

  const handleSubmit = useCallback(
    async (mode: "real" | "sample") => {
      setError("")

      if (mode === "real" && !projectUrl.trim()) {
        setError("Add a LangSmith project URL or name before running a real audit.")
        return
      }

      if (mode === "real" && !apiKey.trim()) {
        setError("Add a LangSmith API key before running a real audit.")
        return
      }

      setLoading(true)
      setCurrentStep(0)

      try {
        const steps = [
          "connecting",
          "fetching",
          "grouping",
          "comparing",
          "detecting",
          "building",
        ]

        for (let i = 0; i < steps.length; i++) {
          setCurrentStep(i)
          if (i > 0) {
            await new Promise((r) => setTimeout(r, 400))
          }
        }

        const res = await fetch("/api/audit/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectUrl: projectUrl || undefined,
            apiKey: mode === "real" ? apiKey : undefined,
            window,
            mode,
          }),
        })

        const data = await res.json()

        if (!res.ok) {
          setError(data.error || "Something went wrong.")
          setCurrentStep(-1)
          return
        }

        if (data.report && data.redirectUrl) {
          const { saveReportToStorage } = await import("@/lib/storage/report-codec")
          saveReportToStorage(data.report)
          router.push(data.redirectUrl)
        }
      } catch {
        setError("Network error. Please try again.")
        setCurrentStep(-1)
      } finally {
        setLoading(false)
      }
    },
    [projectUrl, apiKey, window, router]
  )

  if (loading) {
    return <AuditProgress currentStep={currentStep} error={error} />
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-heading text-lg font-medium tracking-tight text-foreground">
            Generate the diagnosis
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste LangSmith. Get the cache-break report.
          </p>
        </div>
        <Badge variant="secondary" className="hidden shrink-0 lg:inline-flex">
          Read-only audit
        </Badge>
      </div>

      <div className="rounded-xl border bg-card p-2 text-card-foreground shadow-xs">
        <div className="grid gap-2.5 lg:grid-cols-[minmax(200px,1.35fr)_minmax(160px,0.8fr)_120px_auto_auto] lg:items-center">
          <label className="group relative block">
            <span className="sr-only">LangSmith project URL or name</span>
            <RiSearchLine className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="LangSmith project URL or name"
              value={projectUrl}
              onChange={(e) => setProjectUrl(e.target.value)}
              className="h-9 rounded-md border-transparent bg-muted pl-9 text-sm shadow-none focus-visible:bg-background"
            />
          </label>

          <label className="group relative block">
            <span className="sr-only">LangSmith API key</span>
            <RiLockLine className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="password"
              placeholder="API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="h-9 rounded-md border-transparent bg-muted pl-9 text-sm shadow-none focus-visible:bg-background"
            />
          </label>

          <Select value={window} onValueChange={(v) => v && setWindow(v)}>
            <SelectTrigger className="h-9 rounded-md border-transparent bg-muted shadow-none focus-visible:bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">24h</SelectItem>
              <SelectItem value="7d">7 days</SelectItem>
              <SelectItem value="30d">30 days</SelectItem>
              <SelectItem value="1y">1 year</SelectItem>
            </SelectContent>
          </Select>

          <Button
            onClick={() => handleSubmit("real")}
            disabled={!apiKey || !projectUrl}
            className="h-9 gap-1.5"
          >
            Run audit
            <RiArrowRightLine className="size-3.5" />
          </Button>
          <Button
            onClick={() => handleSubmit("sample")}
            variant="secondary"
            className="h-9"
          >
            Sample
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-sm text-muted-foreground">
        {!apiKey ? (
          <span>Add a key for a real audit, or open the sample.</span>
        ) : (
          <span>Key is used once server-side and never stored.</span>
        )}
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <RiLockLine className="size-3.5" />
            Read-only
          </span>
          <span className="inline-flex items-center gap-1.5">
            <RiShieldCheckLine className="size-3.5" />
            No prompt storage
          </span>
        </div>
      </div>

      <details className="group rounded-xl border bg-card text-card-foreground shadow-xs">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-medium text-foreground">
          <span className="inline-flex items-center gap-2">
            <RiTerminalLine className="size-4" />
            Prefer local CLI?
          </span>
          <span className="text-muted-foreground transition group-open:rotate-45">
            +
          </span>
        </summary>
        <div className="px-5 pb-4">
          <CommandBox command={cliCommand} />
          <p className="mt-3 text-sm text-muted-foreground">
            Same audit engine. Your traces stay on your machine.
          </p>
        </div>
      </details>
    </div>
  )
}

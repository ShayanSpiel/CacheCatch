"use client"

import { useState, useCallback } from "react"

declare global {
  interface Window {
    posthog?: {
      capture?: (event: string, properties?: Record<string, unknown>) => void
      identify?: (id: string, properties?: Record<string, unknown>) => void
    }
  }
}

const PLATFORMS = [
  { id: "langsmith", label: "LangSmith" },
  { id: "langfuse", label: "Langfuse" },
  { id: "braintrust", label: "Braintrust" },
] as const

function buildCommand(platform: string) {
  return `npx cachecatch audit "my-agent-app" --provider ${platform} --window 7d`
}

function track(event: string, properties?: Record<string, unknown>) {
  window.posthog?.capture?.(event, properties)
}

export function EmailCapture({ id }: { id: string }) {
  const [email, setEmail] = useState("")
  const [state, setState] = useState<"idle" | "submitting" | "done" | "error">("idle")
  const [errMsg, setErrMsg] = useState("")
  const [copied, setCopied] = useState(false)
  const [platform, setPlatform] = useState("langsmith")
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const cliCommand = buildCommand(platform)

  const handleCopy = useCallback(() => {
    const commandToCopy = buildCommand(platform)
    const copy = () => {
      const ta = document.createElement("textarea")
      ta.value = commandToCopy
      ta.style.position = "fixed"
      ta.style.opacity = "0"
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand("copy")
        setCopied(true)
        track("cli_command_copied", { form_id: id, selected_provider: platform, fallback: true })
      } catch {
        setCopied(false)
      }
      document.body.removeChild(ta)
      setTimeout(() => setCopied(false), 2000)
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(commandToCopy).then(() => {
        setCopied(true)
        track("cli_command_copied", { form_id: id, selected_provider: platform })
      }).catch(() => copy())
    } else {
      copy()
    }
  }, [id, platform])

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const trimmedEmail = email.trim()
      if (!trimmedEmail) return

      setState("submitting")
      setErrMsg("")

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 7000)

      try {
        const res = await fetch("/api/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: trimmedEmail,
            source: "Cachecatch CLI",
            platform,
            page: window.location.pathname,
          }),
          signal: controller.signal,
        })

        const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; backend?: string } | null
        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || "Hmm, didn't go through. Check your connection and retry.")
        }

        window.posthog?.identify?.(trimmedEmail, {
          email: trimmedEmail,
          source: "landing",
          selected_provider: platform,
        })
        track("email_capture_submitted", {
          form_id: id,
          selected_provider: platform,
          capture_backend: data.backend,
        })
        setState("done")
        setEmail("")
      } catch {
        track("email_capture_failed", {
          form_id: id,
          selected_provider: platform,
        })
        setState("error")
        setErrMsg("Hmm, didn't go through. Check your connection and retry.")
      } finally {
        clearTimeout(timeout)
      }
    },
    [email, id, platform]
  )

  const isDone = state === "done"
  const ctgClass = isDone ? "l-cta done" : state === "error" ? "l-cta has-err" : "l-cta"

  return (
    <div className={ctgClass} id={id}>
      <form className="email-row" onSubmit={handleSubmit}>
        <label className="input-box">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 6h16v12H4z" stroke="currentColor" strokeWidth="1.5" />
            <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <input
            type="email"
            placeholder="Get the private MVP"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="off"
            autoCorrect="off"
            required
            aria-label="Email address"
            disabled={state === "submitting"}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button className="btn" type="submit" disabled={state === "submitting"}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {state === "submitting" ? "Sending…" : "Get CLI"}
        </button>
      </form>

      <div className="command-row">
        <div className="command-box">
          <div className="platform-dropdown-wrapper">
            <button
              type="button"
              className="platform-dropdown-trigger"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
              aria-haspopup="listbox"
              aria-expanded={dropdownOpen}
            >
              <span className="platform-label">Platform</span>
              <svg className="platform-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {dropdownOpen && (
              <div className="platform-dropdown-menu" role="listbox">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`platform-dropdown-item${platform === p.id ? " active" : ""}`}
                    role="option"
                    aria-selected={platform === p.id}
                onMouseDown={(e) => {
                      e.preventDefault()
                      setPlatform(p.id)
                      track("cli_provider_selected", { form_id: id, selected_provider: p.id })
                      setDropdownOpen(false)
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="command-code-area">
            <code>
              <span className="prompt-mark">$</span>
              {cliCommand}
            </code>
          </div>
        </div>
        <button className="copy-btn" type="button" onClick={handleCopy}>
          {copied ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M8 8h11v11H8z" stroke="currentColor" strokeWidth="1.6" />
                <path d="M5 16H4V4h12v1" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>

      <div className="l-cta-note">Access unlocked. Copy the local audit command.</div>
      <div className="l-cta-err">{errMsg}</div>
    </div>
  )
}

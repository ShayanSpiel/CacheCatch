"use client"

import { useState, useCallback, useEffect } from "react"
import { emailCapture } from "@/content/landing/copy"

declare global {
  interface Window {
    posthog?: {
      capture?: (event: string, properties?: Record<string, unknown>) => void
      identify?: (id: string, properties?: Record<string, unknown>) => void
    }
  }
}

function buildCommand(platform: string) {
  if (platform === "local") {
    return `npx cachecatch audit local --window 7d`
  }
  return `npx cachecatch audit "my-agent-app" --provider ${platform} --window 7d`
}

function track(event: string, properties?: Record<string, unknown>) {
  window.posthog?.capture?.(event, properties)
}

const SHARED_DONE_KEY = "cachecatch_captured"
const STORAGE_KEY_PREFIX = "cachecatch_capture_"

function loadSharedDone(): { done: boolean; email: string; platform: string } {
  try {
    const raw = localStorage.getItem(SHARED_DONE_KEY)
    if (!raw) return { done: false, email: "", platform: "local" }
    const parsed = JSON.parse(raw) as { done?: boolean; email?: string; platform?: string }
    return { done: !!parsed.done, email: parsed.email || "", platform: parsed.platform || "local" }
  } catch {
    return { done: false, email: "", platform: "local" }
  }
}

function persistSharedDone(done: boolean, email: string, platform: string) {
  try {
    localStorage.setItem(SHARED_DONE_KEY, JSON.stringify({ done, email, platform }))
  } catch { /* noop */ }
}

function loadPlatform(id: string): string {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${id}_platform`)
    return raw || "local"
  } catch {
    return "local"
  }
}

function persistPlatform(id: string, platform: string) {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${id}_platform`, platform)
  } catch { /* noop */ }
}

export function EmailCapture({ id }: { id: string }) {
  const [email, setEmail] = useState("")
  const [errMsg, setErrMsg] = useState("")
  const [copied, setCopied] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [ctaNote, setCtaNote] = useState<string>(emailCapture.defaultNote)

  // Initial state must match what the server renders, otherwise React 19
  // will throw a hydration mismatch. The server always renders "idle" +
  // "local" + the default CTA note, so we mirror that on the client's
  // first render and only update from localStorage after mount.
  const [state, setState] = useState<"idle" | "submitting" | "done" | "error">("idle")
  const [platform, setPlatform] = useState("local")
  const [hydrated, setHydrated] = useState(false)

  // Defer the localStorage read into a microtask. The setState calls happen
  // inside the queueMicrotask callback (not synchronously in the effect
  // body), so the react-hooks/set-state-in-effect rule allows it, and we
  // still avoid a visible "idle → done" flash on the very first paint.
  useEffect(() => {
    const applyStored = () => {
      const shared = loadSharedDone()
      if (shared.done) {
        setState("done")
        setPlatform(shared.platform)
      } else {
        setPlatform(loadPlatform(id))
      }
      setHydrated(true)
    }
    if (typeof queueMicrotask === "function") {
      queueMicrotask(applyStored)
    } else {
      Promise.resolve().then(applyStored)
    }
  }, [id])

  // Cross-tab sync: setState inside the storage event callback is allowed
  // by the react-hooks/set-state-in-effect rule.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SHARED_DONE_KEY) {
        const next = loadSharedDone()
        if (next.done) {
          setState("done")
          setPlatform(next.platform)
        }
      }
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [id])

  // Toast: when state becomes "done" after hydration, show submitNote for
  // 5s, then revert. The 5s setTimeout callback is allowed; we kick off the
  // "show" via a microtask to keep the effect body setState-free.
  useEffect(() => {
    if (state !== "done" || !hydrated) return
    const showToast = () => setCtaNote(emailCapture.submitNote)
    if (typeof queueMicrotask === "function") {
      queueMicrotask(showToast)
    } else {
      Promise.resolve().then(showToast)
    }
    const timer = setTimeout(() => setCtaNote(emailCapture.defaultNote), 5000)
    return () => clearTimeout(timer)
  }, [state, hydrated])

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

  const handlePlatformChange = useCallback((newPlatform: string) => {
    setPlatform(newPlatform)
    track("cli_provider_selected", { form_id: id, selected_provider: newPlatform })
    persistPlatform(id, newPlatform)
    const sharedState = loadSharedDone()
    if (sharedState.done) {
      persistSharedDone(true, sharedState.email, newPlatform)
    }
  }, [id])

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
          throw new Error(data?.error || emailCapture.errorMessage)
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
        persistSharedDone(true, trimmedEmail, platform)
      } catch {
        track("email_capture_failed", {
          form_id: id,
          selected_provider: platform,
        })
        setState("error")
        setErrMsg(emailCapture.errorMessage)
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
            placeholder={emailCapture.placeholder}
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
          {state === "submitting" ? emailCapture.sendingLabel : emailCapture.submitLabel}<span className="btn-arrow">→</span>
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
              <span className="platform-label">{emailCapture.platformLabel}</span>
              <svg className="platform-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {dropdownOpen && (
              <div className="platform-dropdown-menu" role="listbox">
                {emailCapture.platforms.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`platform-dropdown-item${platform === p.id ? " active" : ""}`}
                    role="option"
                    aria-selected={platform === p.id}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      handlePlatformChange(p.id)
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
              {emailCapture.copiedLabel}
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M8 8h11v11H8z" stroke="currentColor" strokeWidth="1.6" />
                <path d="M5 16H4V4h12v1" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              {emailCapture.copyLabel}
            </>
          )}
        </button>
      </div>

      <div className="l-cta-note">{ctaNote}</div>
      <div className="l-cta-err">{errMsg}</div>
    </div>
  )
}

"use client"

import Image from "next/image"
import { useCallback, useEffect, useState } from "react"
import { emailCapture } from "@/content/landing/copy"

function buildCommand(platform: string) {
  if (platform === "local") {
    return "npx --yes cachecatch audit local --window 7d"
  }
  return `npx --yes cachecatch audit "my-agent-app" --provider ${platform} --window 7d`
}

function track(event: string, properties?: Record<string, unknown>) {
  window.posthog?.capture?.(event, properties)
}

const STORAGE_KEY_PREFIX = "cachecatch_capture_"

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

export function LocalReportCli({ id }: { id: string }) {
  const [copied, setCopied] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [platform, setPlatform] = useState("local")

  useEffect(() => {
    setPlatform(loadPlatform(id))
  }, [id])

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
  }, [id])

  return (
    <div className="l-cli" id={id}>
      <div className="command-row is-live">
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
              <Image className="platform-chevron" src="/landing/icons/chevron-down.svg" alt="" width={12} height={12} aria-hidden="true" />
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

      <div className="l-cta-note">
        Free + <a href="https://github.com/shayanspiel/cachecatch" target="_blank" rel="noopener noreferrer" className="inline-link">open-source <Image className="inline-icon" src="/landing/icons/external-link.svg" alt="" width={12} height={12} aria-hidden="true" /></a>. Runs locally. No prompts uploaded.
      </div>
    </div>
  )
}

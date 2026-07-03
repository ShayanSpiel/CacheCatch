"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { demo } from "@/content/landing/copy"

interface TabContent {
  sections: string[]
  prompt: string
}

interface TerminalDemoProps {
  tabs: Record<string, TabContent>
  defaultTab?: string
}

type TabId = string

const TAB_ORDER = ["agents", "langsmith"] as const

const TAB_LABELS: Record<TabId, string> = {
  agents: "Agents Cache Report",
  langsmith: "LangSmith Cache Report",
}

export function TerminalDemo({ tabs, defaultTab = "agents" }: TerminalDemoProps) {
  const shellRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const playedRef = useRef(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab)
  const [revealKey, setRevealKey] = useState(0)

  const { sections, prompt } = tabs[activeTab] ?? { sections: [], prompt: "" }

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  }, [])

  const reveal = useCallback(() => {
    if (playedRef.current) return
    playedRef.current = true
    if (prefersReducedMotion) {
      setIsGenerating(false)
      setIsComplete(true)
      return
    }
    setIsGenerating(true)
  }, [prefersReducedMotion])

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return

    const onMouseEnter = () => reveal()
    const onTouchStart = () => reveal()
    const onFocus = () => reveal()
    const onClick = () => reveal()

    shell.addEventListener("mouseenter", onMouseEnter)
    shell.addEventListener("touchstart", onTouchStart, { passive: true })
    shell.addEventListener("focus", onFocus)
    shell.addEventListener("click", onClick)

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !playedRef.current) {
            const delay = entry.intersectionRatio > 0.55 ? 40 : 90
            setTimeout(() => reveal(), delay)
          }
        })
      },
      { rootMargin: "0px 0px -18% 0px", threshold: [0.18, 0.35, 0.55] }
    )
    observer.observe(shell)

    return () => {
      shell.removeEventListener("mouseenter", onMouseEnter)
      shell.removeEventListener("touchstart", onTouchStart)
      shell.removeEventListener("focus", onFocus)
      shell.removeEventListener("click", onClick)
      observer.disconnect()
    }
  }, [reveal])

  useEffect(() => {
    if (!isGenerating) return
    const DURATION = 2200
    const start = performance.now()
    let raf: number
    const body = bodyRef.current

    const tick = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / DURATION, 1)
      const ease = 1 - Math.pow(1 - progress, 3)
      if (body) {
        body.style.clipPath = `inset(0 0 ${(1 - ease) * 100}% 0)`
      }
      if (progress < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        if (body) body.style.clipPath = "none"
        setIsGenerating(false)
        setIsComplete(true)
      }
    }

    if (body) body.style.clipPath = "inset(0 0 100% 0)"
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isGenerating, prefersReducedMotion])

  const handleTabSwitch = useCallback((tabId: TabId) => {
    if (tabId === activeTab) return
    playedRef.current = false
    setIsGenerating(false)
    setIsComplete(false)
    setRevealKey((k) => k + 1)
    setActiveTab(tabId)
    const body = bodyRef.current
    if (body) body.style.clipPath = "none"
  }, [activeTab])

  return (
    <div className="terminal-shell" ref={shellRef} tabIndex={0} aria-label="CACHECATCH sample report preview">
      <div className="terminal-bar">
        <div className="dots" aria-hidden="true">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </div>
        <div className="chrome-tab-bar" role="tablist">
          {TAB_ORDER.map((tabId) => (
            <button
              key={tabId}
              type="button"
              role="tab"
              aria-selected={activeTab === tabId}
              className={`chrome-tab ${activeTab === tabId ? "is-active" : ""}`}
              onClick={() => handleTabSwitch(tabId)}
            >
              <span className="chrome-tab-content">{TAB_LABELS[tabId]}</span>
            </button>
          ))}
        </div>
        <div className={`term-status ${isComplete ? "is-ready" : isGenerating ? "is-generating" : ""}`} aria-hidden="true">
          {isComplete ? "ready" : isGenerating ? "rendering…" : "idle"}
        </div>
      </div>
      <div
        ref={bodyRef}
        className={`terminal-body terminal-report-body ${isGenerating || isComplete ? "is-revealed" : ""}`}
      >
        <div className="terminal-report-frame">
          <div className="terminal-report-stream">
            {sections.map((sectionHtml, index) => (
              <div
                key={`${revealKey}-${index}-${sectionHtml.length}`}
                className="terminal-report-section is-visible"
              >
                <div className="terminal-report-inner" dangerouslySetInnerHTML={{ __html: sectionHtml }} />
              </div>
            ))}
            {(isGenerating || isComplete) && (
              <div className={`terminal-report-prompt ${isComplete ? "is-visible" : ""}`}>
                <span className="terminal-report-prompt-mark">$ </span>
                <span>{prompt}</span>
                <span className="terminal-report-cursor" aria-hidden="true" />
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="terminal-hint">{demo.hint}</div>
    </div>
  )
}

"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

interface TerminalDemoProps {
  sections: string[]
  prompt: string
}

export function TerminalDemo({ sections, prompt }: TerminalDemoProps) {
  const shellRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const playedRef = useRef(false)
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const [revealedCount, setRevealedCount] = useState(0)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isComplete, setIsComplete] = useState(false)

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  }, [])

  const reveal = useCallback(() => {
    if (playedRef.current) return
    playedRef.current = true
    setRevealedCount(0)
    if (prefersReducedMotion) {
      setRevealedCount(sections.length)
      setIsGenerating(false)
      setIsComplete(true)
      return
    }
    setIsGenerating(true)
  }, [prefersReducedMotion, sections.length])

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
            const timer = setTimeout(() => reveal(), delay)
            timersRef.current.push(timer)
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
      for (const timer of timersRef.current) clearTimeout(timer)
      timersRef.current = []
    }
  }, [reveal])

  useEffect(() => {
    if (!isGenerating) return

    for (const timer of timersRef.current) clearTimeout(timer)
    timersRef.current = []

    const delays = [45, 95, 85, 80, 75, 70, 65, 60]
    let index = 0

    const tick = () => {
      index += 1
      setRevealedCount(index)
      if (index >= sections.length) {
        setIsGenerating(false)
        setIsComplete(true)
        return
      }
      const timer = setTimeout(tick, delays[Math.min(index, delays.length - 1)])
      timersRef.current.push(timer)
    }

    const startTimer = setTimeout(tick, delays[0])
    timersRef.current.push(startTimer)

    return () => {
      for (const timer of timersRef.current) clearTimeout(timer)
      timersRef.current = []
    }
  }, [isGenerating, prefersReducedMotion, sections.length])

  useEffect(() => {
    const body = bodyRef.current
    if (!body || revealedCount === 0 || prefersReducedMotion) return

    body.scrollTo({
      top: body.scrollHeight,
      behavior: "smooth",
    })
  }, [prefersReducedMotion, revealedCount])

  const visibleSections = sections.slice(0, revealedCount)

  return (
    <div className="terminal-shell" ref={shellRef} tabIndex={0} aria-label="CACHECATCH sample report preview">
      <div className="terminal-bar">
        <div className="dots" aria-hidden="true">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </div>
        <div className="term-title">cachecatch sample report / cli preview</div>
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
            {visibleSections.map((sectionHtml, index) => (
              <div
                key={`${index}-${sectionHtml.length}`}
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
      <div className="terminal-hint">Summarized from the same sample data used by `cachecatch sample`.</div>
    </div>
  )
}

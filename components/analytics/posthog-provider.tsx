"use client"

import { useEffect } from "react"
import { usePathname, useSearchParams } from "next/navigation"

declare global {
  interface Window {
    posthog?: {
      capture?: (event: string, properties?: Record<string, unknown>) => void
      identify?: (id: string, properties?: Record<string, unknown>) => void
      init?: (key: string, config?: Record<string, unknown>) => void
    }
  }
}

export function PostHogPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!window.posthog?.capture) return
    const url = window.location.href
    window.posthog.capture("$pageview", { $current_url: url })
  }, [pathname, searchParams])

  return null
}

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

export function PostHogInit() {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com"
    if (!key || window.posthog?.init) return

    const script = document.createElement("script")
    script.src = `${host}/static/array.js`
    script.async = true
    script.onload = () => {
      window.posthog?.init?.(key, {
        api_host: host,
        person_profiles: "identified_only",
        capture_pageview: false,
        capture_pageleave: true,
      })
    }
    document.head.appendChild(script)
  }, [])

  return null
}

export function PostHogPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!window.posthog?.capture) return
    let url = pathname
    const params = searchParams.toString()
    if (params) url += `?${params}`
    window.posthog.capture("$pageview", { $current_url: url })
  }, [pathname, searchParams])

  return null
}

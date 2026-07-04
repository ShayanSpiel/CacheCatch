import type { Metadata } from "next"
import { Suspense } from "react"
import Script from "next/script"
import { JetBrains_Mono, Micro_5 } from "next/font/google"
import { TooltipProvider } from "@/components/ui/tooltip"
import { NotificationProvider } from "@/components/shared/notification-toast"
import { PostHogInit, PostHogPageView } from "@/components/analytics/posthog-provider"
import "./globals.css"
import "../components/landing/landing.css"

const GA_ID = "G-P43CBK4EEX"

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
})

const micro5 = Micro_5({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-micro-5",
  display: "swap",
})

export const metadata: Metadata = {
  title: "CacheCatch — Prompt Cache Audit & Cost Optimization",
  description:
    "CacheCatch audits LLM token costs and prompt-cache efficiency across LangSmith, Langfuse, Braintrust, and local IDE agents (Claude Code, Codex, OpenCode). Detects cache breakers, estimates wasted spend, and gives exact prompt-layout fixes to cut AI costs up to 90%.",
  applicationName: "CacheCatch",
  keywords: [
    "cache optimization",
    "token cost audit",
    "prompt caching",
    "AI cost optimization",
    "LLM cost audit",
    "prompt cache audit",
    "LangSmith cost",
    "Langfuse cost",
    "Braintrust cost",
    "AI token savings",
    "LLM cost reduction",
    "prompt cache optimization",
    "context caching",
    "AI agent cost",
    "Claude Code cost",
    "Codex cost",
    "OpenCode cost",
    "LLM trace audit",
    "agentic AI cost",
    "prompt layout fix",
  ],
  authors: [{ name: "CacheCatch" }],
  creator: "CacheCatch",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${jetbrainsMono.variable} ${micro5.variable} font-sans antialiased`}
    >
      <head>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga-init" strategy="afterInteractive">
          {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}',{send_page_view:true});`}
        </Script>
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <PostHogInit />
        <Suspense fallback={null}>
          <PostHogPageView />
        </Suspense>
        <NotificationProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </NotificationProvider>
      </body>
    </html>
  )
}

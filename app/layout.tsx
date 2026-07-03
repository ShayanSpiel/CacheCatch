import type { Metadata } from "next"
import { JetBrains_Mono, Micro_5 } from "next/font/google"
import { TooltipProvider } from "@/components/ui/tooltip"
import { NotificationProvider } from "@/components/shared/notification-toast"
import "./globals.css"

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
  title: "CacheCatch — Context Cost Audit and Cache Optimization Platform",
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
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
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
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <NotificationProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </NotificationProvider>
      </body>
    </html>
  )
}

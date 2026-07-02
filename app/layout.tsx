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
  title: "CACHECATCH — Prompt CacheOps for AI Teams",
  description:
    "CACHECATCH audits AI traces, detects prompt-cache breakers, estimates wasted spend, and gives exact prompt-layout fixes for OpenAI, Claude, LangSmith, and agentic LLM systems.",
  applicationName: "CACHECATCH",
  keywords: ["prompt caching", "LangSmith", "Langfuse", "Braintrust", "LLM observability", "cache ops"],
  authors: [{ name: "CACHECATCH" }],
  creator: "CACHECATCH",
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

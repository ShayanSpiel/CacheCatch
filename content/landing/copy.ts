/**
 * Landing page copy — all user-facing strings for the CACHECATCH landing page.
 *
 * Organized by section. Import this file in app/page.tsx and components.
 * No logic, no React — pure copy constants.
 */

/* ─── Hero ──────────────────────────────────────────────────────────── */

export const hero = {
  eyebrow: "UP TO 90% LOWER CACHED INPUT COST",
  headline: {
    line1: "Find the token",
    line2: "that kills cache.",
  },
  subtitle:
    "Whether you trace through LangSmith or run agents directly in your IDE — CACHECATCH turns runs and sessions into a cache-loss report: exact divergence, wasted spend, and the prompt fix your team should ship first.",
  sampleLink: "View sample report",
} as const

/* ─── Provider pills (labels only — icons stay in JSX) ──────────────── */

export const providers = {
  langsmith: "LangSmith",
  langfuse: "Langfuse",
  braintrust: "Braintrust",
  localAgents: "Local Agents",
  tooltip: [
    { name: "Claude Code", icon: "claude.svg" },
    { name: "Codex", icon: "codex.svg" },
    { name: "OpenCode", icon: "opencode.svg" },
  ],
} as const

/* ─── Demo section ──────────────────────────────────────────────────── */

export const demo = {
  kicker: "Real CLI report",
  headline: {
    line1: "A cache audit",
    line2: "engineers can act on.",
  },
  body: "A fast CLI report that summarizes a sample audit — recoverable loss, the top leaking routes, the exact prefix break, and the prompt layout to ship next. Works with cloud traces and local IDE agent sessions alike.",
  prompt: "npx cachecatch audit local --window 7d",
  hint: "Summarized from sample data used by `cachecatch sample` and `cachecatch audit local`.",
} as const

/* ─── Banner / X-post section ───────────────────────────────────────── */

export const banner = {
  kicker: "Community cache reports",
  headline: {
    line1: "Show the community",
    line2: "how efficient your agents are.",
  },
  body: "Generate your own cache report card and share it on X. Let the community see how well your agentic sessions hit cache — or how much you could save with one prompt fix.",
  ctaLink: "Generate your 𝕏 report card now",
  xPost: {
    name: "Shayan",
    handle: "@ShayanSpiel",
    body: [
      "My AI agents apparently had a whole life behind my back.",
      "1,296 sessions\n4.69B token activity\n90,794 tool calls\n48 subagent runs",
      "Cache profile + cost gap found by CacheCatch.",
      "Try yours:\ncachecatch.spielos.xyz",
    ],
    imageAlt:
      "CacheCatch local agent report showing 1,296 sessions with 4.69B tokens and 90,794 tool calls",
    time: "12:00 PM · Jul 1, 2026",
  },
} as const

/* ─── Proof section ─────────────────────────────────────────────────── */

export const proof = {
  kicker: "Why this matters",
  headline: {
    line1: "Provider caching is real.",
    line2: "Your prompt order can still break it.",
  },
  body: "OpenAI and Anthropic reward stable prefixes — whether you call them from cloud traces or local IDE agents. CACHECATCH shows exactly where your prompt stops being cacheable and what that costs.",
  sources:
    "Sources: OpenAI prompt caching docs, Anthropic pricing docs, and the 2026 agentic prompt-caching evaluation.",
} as const

/* ─── Report section ────────────────────────────────────────────────── */

export const report = {
  kicker: "What the report gives you",
  headline: {
    line1: "The missing layer",
    line2: "after tracing.",
  },
  body: "Tracing tools show runs, latency, token usage, and cost. Local agents generate sessions but leave cache efficiency unseen. CACHECATCH turns both into the cache diagnosis your team can act on immediately.",
  features: [
    {
      num: 1,
      title: "Find the cache breaker",
      body: "Request IDs, timestamps, user metadata, RAG blocks, tool schemas, and dynamic system prompts that appear before the stable prefix.",
    },
    {
      num: 2,
      title: "Rank routes by waste",
      body: "Group repeated agent routes and show monthly waste, divergence depth, severity, evidence, and confidence per route.",
    },
    {
      num: 3,
      title: "Ship the fix plan",
      body: "Move stable rules, tools, policy, and examples first. Push session metadata, user query, and tool outputs into the dynamic tail.",
    },
  ],
  compare: {
    tracingStack: {
      title: "Your tracing stack keeps",
      items: [
        "traces, runs, and latency",
        "token usage and model metadata",
        "debugging context and observability",
      ],
    },
    cachecatch: {
      title: "CACHECATCH adds",
      items: [
        "first divergence token",
        "cache-specific waste estimate",
        "exact prompt-layout fix plan",
      ],
    },
  },
} as const

/* ─── CTA section ───────────────────────────────────────────────────── */

export const cta = {
  kicker: "Run the audit",
  headline: {
    line1: "Stop paying full price",
    line2: "for reusable context.",
  },
  body: "Drop your email, grab the CLI, and run the audit on your local agent sessions or cloud traces in minutes.",
} as const

/* ─── Email capture ─────────────────────────────────────────────────── */

export const emailCapture = {
  placeholder: "Email for CLI access",
  submitLabel: "Get CLI",
  sendingLabel: "Sending…",
  defaultNote: "Free + open-source. Runs locally. No prompts uploaded.",
  submitNote: "Access unlocked. Copy the audit command and generate your report locally.",
  copyLabel: "Copy",
  copiedLabel: "Copied",
  platformLabel: "Platform",
  errorMessage: "Hmm, didn't go through. Check your connection and retry.",
  platforms: [
    { id: "langsmith", label: "LangSmith" },
    { id: "langfuse", label: "Langfuse" },
    { id: "braintrust", label: "Braintrust" },
    { id: "local", label: "IDE Agents" },
  ] as const,
} as const

/* ─── Footer ────────────────────────────────────────────────────────── */

export const footer = {
  tagline: "CACHECATCH — prompt-cache diagnosis for AI teams. No stored prompts. No saved API keys.",
  links: [
    { href: "https://x.com/ShayanSpiel", label: "@ShayanSpiel" },
    { href: "https://spielos.xyz", label: "spielos.xyz" },
  ],
} as const

/* ─── Navigation ────────────────────────────────────────────────────── */

export const nav = {
  demo: "Demo",
  proof: "Proof",
  report: "Report",
  getCLI: "Get CLI",
  githubLabel: "GitHub",
} as const

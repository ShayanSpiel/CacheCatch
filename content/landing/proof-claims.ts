/**
 * Proof claims — metadata for the "Why this matters" section.
 *
 * Each claim carries its display value, descriptive label, source label,
 * and an optional source URL. Icons are resolved in the consuming component.
 */

export interface ProofClaim {
  value: string
  label: string
  sourceLabel: string
  sourceUrl?: string
  /** Icon component name — resolved by the page, not by this file. */
  iconKey: "money" | "time" | "shield" | "chart"
}

export const proofClaims: ProofClaim[] = [
  {
    value: "up to 90%",
    label: "lower cached input-token cost documented by OpenAI.",
    sourceLabel: "OpenAI prompt caching docs",
    sourceUrl: "https://platform.openai.com/docs/guides/prompt-caching",
    iconKey: "money",
  },
  {
    value: "up to 80%",
    label: "lower latency possible when reusable prefixes hit cache.",
    sourceLabel: "OpenAI prompt caching docs",
    sourceUrl: "https://platform.openai.com/docs/guides/prompt-caching",
    iconKey: "time",
  },
  {
    value: "10%",
    label: "of standard input price for Anthropic cache-read tokens.",
    sourceLabel: "Anthropic pricing docs",
    sourceUrl: "https://docs.anthropic.com/en/docs/about-claude/models",
    iconKey: "shield",
  },
  {
    value: "45-80%",
    label: "API cost reduction measured in a 2026 agentic prompt-caching evaluation.",
    sourceLabel: "2026 agentic prompt-caching evaluation",
    iconKey: "chart",
  },
]

/**
 * Mock / sample adapter.
 *
 * Used for:
 *  - `cachecatch sample` — show users a beautiful report without API keys
 *  - Tests — predictable, deterministic data
 *  - CI smoke — verifies the engine + reporting stack end to end
 */

import type {
  NormalizedTrace,
  ProviderAdapter,
  TraceMessage,
} from "../types/index.ts"

interface MockRouteSpec {
  route: string
  model: string
  provider: NormalizedTrace["provider"]
  promptTemplate: string
  /** Number of synthetic traces to generate for this route. */
  runs: number
  /** Stable token count (kept identical across runs). */
  stableTokens: number
  /** Position (in chars) where the dynamic content begins. */
  dynamicStart: number
  /** Whether the dynamic content is a UUID / timestamp / RAG chunk. */
  dynamicKind: "uuid" | "timestamp" | "rag" | "name" | "tool-drift"
  /** Token count of the dynamic tail. */
  dynamicTokens: number
  /** Cache read rate, 0-1. */
  cacheReadRate: number
  cacheCreationRate: number
}

const MOCK_SPECS: MockRouteSpec[] = [
  {
    route: "support_agent.answer",
    model: "gpt-4o",
    provider: "langsmith",
    promptTemplate: "support_agent",
    runs: 50,
    stableTokens: 4200,
    dynamicStart: 192,
    dynamicKind: "uuid",
    dynamicTokens: 7300,
    cacheReadRate: 0.059,
    cacheCreationRate: 0.18,
  },
  {
    route: "refund_agent.review",
    model: "gpt-4o",
    provider: "langsmith",
    promptTemplate: "refund_agent",
    runs: 25,
    stableTokens: 3700,
    dynamicStart: 72,
    dynamicKind: "tool-drift",
    dynamicTokens: 9200,
    cacheReadRate: 0.084,
    cacheCreationRate: 0.26,
  },
  {
    route: "docs_rag.summarize",
    model: "gpt-4o-mini",
    provider: "langsmith",
    promptTemplate: "docs_rag",
    runs: 18,
    stableTokens: 4400,
    dynamicStart: 208,
    dynamicKind: "rag",
    dynamicTokens: 8900,
    cacheReadRate: 0.152,
    cacheCreationRate: 0.22,
  },
  {
    route: "sales_agent.compose",
    model: "gpt-4o",
    provider: "langsmith",
    promptTemplate: "sales_agent",
    runs: 14,
    stableTokens: 3500,
    dynamicStart: 0,
    dynamicKind: "name",
    dynamicTokens: 12000,
    cacheReadRate: 0.031,
    cacheCreationRate: 0.13,
  },
]

function buildPrompt(template: string, kind: MockRouteSpec["dynamicKind"], index: number): string {
  const stable = getStablePart(template)
  const dynamic = getDynamicPart(kind, index)
  return stable + dynamic
}

function getStablePart(template: string): string {
  const map: Record<string, string> = {
    support_agent: `You are a senior support engineer for Acme Corp.

POLICY:
- Always greet the customer by their first name.
- Never promise refunds over $50 without manager approval.
- Cite the relevant help-doc article ID when possible.

TOOLS:
- lookupCustomer(customer_id: str)
- createTicket(subject: str, body: str, priority: str)
- sendEmail(to: str, subject: str, body: str)
- escalateToHuman(reason: str)

STATIC EXAMPLES:
Q: "How do I reset my password?"
A: "Go to Settings → Security → Reset. We'll email a 6-digit code."

Q: "Where can I see my invoices?"
A: "Visit Billing → Invoices. The last 24 months are downloadable as PDF."

RULES:
- Be concise.
- Use markdown.
- If unsure, say so.
`,
    refund_agent: `You are a refund agent. Validate every refund against policy.

POLICY:
- Refunds under $50: auto-approve.
- Refunds $50-$500: require manager review.
- Refunds over $500: require finance sign-off + reason code.

TOOLS:
- lookupOrder(order_id: str)
- checkInventory(sku: str)
- issueRefund(order_id: str, amount_cents: int, reason_code: str)
- notifyCustomer(order_id: str, message: str)

EXAMPLES:
- "Refund order #A1234 for $29.99 — out of stock" → approve, reason: BACKORDER
- "Refund order #B5678 for $129.00 — defective" → escalate, reason: DEFECT
`,
    docs_rag: `You are a technical writer summarizing retrieved documents.

RULES:
- Summarize in 3 bullets max.
- Quote source titles.
- Highlight anything that contradicts the user's question.

FORMAT:
- Bullet 1 — main idea
- Bullet 2 — supporting detail
- Bullet 3 — caveat or limit
`,
    sales_agent: `You are an outbound sales copywriter.

TASK:
- Write a 3-paragraph cold email.
- Use a friendly, non-pushy tone.
- End with a clear, low-friction CTA ("worth a 15-min chat?").

STATIC EXAMPLES:
"Hi {name}, loved your recent post on {topic}..."
`,
  }
  return map[template] || ""
}

function getDynamicPart(
  kind: MockRouteSpec["dynamicKind"],
  index: number
): string {
  const uuid = `7f3c8a2e-${(index + 1000).toString(16)}-${(index + 2000).toString(16)}-${index.toString(16).padStart(4, "0")}-${(index + 9000).toString(16).padStart(12, "0")}`
  const ts = new Date(Date.now() - index * 60_000).toISOString()
  switch (kind) {
    case "uuid":
      return `\n\n--- DYNAMIC ---\nuser_id: usr_${uuid.slice(0, 8)}\nsession: sess_${uuid.slice(9, 17)}\ntimestamp: ${ts}\n\nQuestion: How do I change my billing email?`
    case "timestamp":
      return `\n\n--- DYNAMIC ---\ntimestamp: ${ts}\nreq_id: RFD-2026-${(100000 + index).toString()}\n\nRefund request review for order #A${(1000 + index)}.`
    case "rag":
      return `\n\n--- DYNAMIC ---\nRETRIEVED CHUNKS:\n[1] "Cache primer: caching sits between the model and the runtime. ..."\n[2] "TTL rules vary by provider. ..."\n[3] "Cost savings: 50%-90% on cached tokens. ..."\n\nQuestion: How do I tune my cache TTL?`
    case "name":
      return `\n\n--- DYNAMIC ---\nCustomer: John Customer #${index}\nCompany: Acme #${index}\nTopic: on-prem cache strategy\n\nCompose a 3-paragraph cold email.`
    case "tool-drift":
      return `\n\n--- DYNAMIC ---\norder_id: ORD-${(5000 + index).toString()}\nincludeNotes: ${index % 2 === 0 ? "true" : "false"}\nrefundWindow: ${index % 2 === 0 ? "30d" : "60d"}\n\nShould we refund order ORD-${(5000 + index).toString()}?`
  }
}

function buildMessages(text: string): TraceMessage[] {
  return [
    { role: "system", content: "You are a helpful AI assistant." },
    { role: "user", content: text },
  ]
}

function generateMockTraces(): NormalizedTrace[] {
  const traces: NormalizedTrace[] = []
  for (const spec of MOCK_SPECS) {
    for (let i = 0; i < spec.runs; i++) {
      const promptText = buildPrompt(spec.promptTemplate, spec.dynamicKind, i)
      const inputTokens = Math.round(
        (spec.stableTokens + spec.dynamicTokens) * (0.9 + Math.random() * 0.2)
      )
      const outputTokens = Math.round(inputTokens * 0.12)
      const cacheReadTokens = Math.round(inputTokens * spec.cacheReadRate)
      const cacheCreationTokens = Math.round(inputTokens * spec.cacheCreationRate)

      traces.push({
        traceId: `${spec.route}-${i.toString().padStart(4, "0")}`,
        provider: spec.provider,
        model: spec.model,
        route: spec.route,
        promptText,
        messages: buildMessages(promptText),
        metrics: {
          totalInputTokens: inputTokens,
          totalOutputTokens: outputTokens,
          cacheReadTokens,
          cacheCreationTokens,
          costUsd: (inputTokens / 1000) * 0.003 + (outputTokens / 1000) * 0.006,
          estimatedWasteUsd: 0,
        },
        startedAt: new Date(Date.now() - i * 60_000).toISOString(),
        metadata: { mock: true, route: spec.route, index: i },
      })
    }
  }
  return traces
}

let cachedMock: NormalizedTrace[] | null = null

export const mockAdapter: ProviderAdapter = {
  id: "mock",
  displayName: "Mock / Sample",

  async resolveProject(ref: string) {
    return {
      id: "mock-project",
      name: ref || "Mock Project",
    }
  },

  async fetchTraces({ project, limit }) {
    if (!cachedMock) cachedMock = generateMockTraces()
    const slices = cachedMock.slice(0, limit ?? cachedMock.length)
    return {
      traces: slices,
      projectName: project || "Sample Project (Mock)",
    }
  },
}

export function buildMockTraces(): NormalizedTrace[] {
  if (!cachedMock) cachedMock = generateMockTraces()
  return cachedMock
}

export function resetMockTraces(): void {
  cachedMock = null
}

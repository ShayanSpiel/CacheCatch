# Product Contract

## What Cachecatch is

Cachecatch is a **prompt-cache audit tool** for LLM observability platforms.
It analyzes LLM run traces to detect why prompt caching is underperforming
and provides actionable fixes.

It works with **LangSmith**, **Langfuse**, and **Braintrust**. Each
provider is a pluggable adapter — adding another provider is a single
new file in `src/adapters/`.

## Inputs

| Field | Type | Required | Description |
|---|---|---|---|
| `project` | string | Yes (CLI) | Project name, ID, or LangSmith URL |
| `provider` | `"langsmith" \| "langfuse" \| "braintrust"` | No (default `langsmith`) | Which provider to fetch from |
| `apiKey` | string | Yes for live audit | Provider API key (read from env if not passed) |
| `window` | `"24h" \| "7d" \| "30d" \| "1y"` | Yes | Time range for run analysis |
| `mode` | `"real" \| "sample"` | No (CLI) | If `"sample"` or no apiKey, returns sample data |

API keys are never stored or logged.

## Outputs

Returns a `CachecatchReport` object (see `src/types/index.ts` for the
full TypeScript type definition).

Key structure:

```typescript
interface CachecatchReport {
  id: string
  createdAt: string
  source: "langsmith" | "langfuse" | "braintrust" | "mock" | "sample"
  projectName: string
  projectUrl?: string
  window: AuditWindow
  score: number              // 0-100
  confidence: "low" | "medium" | "high"
  summary: {
    runsAnalyzed: number
    routesAnalyzed: number
    observedCacheReadTokens: number
    observedCacheCreationTokens: number
    observedInputTokens: number
    observedOutputTokens: number
    observedCacheReadRate: number | null
    estimatedReusableTokensAfterDivergence: number
    estimatedCacheOpportunityTokens: number
    estimatedMonthlyWasteUsd: number
    topBreaker: string
  }
  routes: RouteAudit[]
  findings: CacheFinding[]
  recommendedLayout: {
    stablePrefix: string[]
    dynamicTail: string[]
  }
  fixPlan: string[]
  dataQuality: DataQuality
}
```

## What Cachecatch does

- Fetches LLM runs from a provider via their public API
- Normalizes run data (prompts, tokens, model info) into a
  provider-agnostic `NormalizedTrace[]`
- Detects cache-breaking patterns: dynamic metadata, timestamps, request
  IDs, tool drift, RAG misplacement
- Estimates wasted cache opportunity and monthly cost
- Generates a deterministic fix plan and recommended prompt layout
- Returns a structured `CachecatchReport`

## What Cachecatch does NOT do

- **Not a full observability platform** — it only analyzes prompt-cache efficiency
- **Not a semantic cache** — it does not store or serve cached responses
- **Not a prompt optimizer** — it does not rewrite prompts for better LLM answers
- **Not a monitoring tool** — it provides point-in-time audits, not continuous monitoring
- **Not a data store** — it does not store API keys, full prompts, or run data persistently
- **Not authenticated** — no user accounts, no billing, no multi-tenancy
- **Not a database** — reports are held in browser sessionStorage only (web app)

## Deterministic analysis

All analysis is rule-based and deterministic. No LLM calls are made
during analysis. Results are reproducible given the same input data.

## Data privacy

- API keys are used once and discarded
- Full prompts are redacted in reports (not truncated, but rendered as evidence snippets)
- No data is sent to any third party besides the chosen provider (when doing live audits)
- Sample mode requires no external API calls
- `.env` file is gitignored; the CLI never logs keys

## CLI vs Web

| Surface | Best for |
|---|---|
| **CLI** (`npx cachecatch …`) | Technical users, CI, scripting, sharing HTML reports |
| **Web app** (`npm run dev`) | Marketing, no-install demo, first-time users |

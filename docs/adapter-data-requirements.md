# Adapter Data Requirements

For Cachecatch to produce an accurate audit, each provider's runs must
include enough data for the engine to detect cache-breaking patterns.

## Universal requirements (all providers)

| Field | Why |
|---|---|
| **Rendered prompt / messages** | Prompt text is needed to detect cache breakers. |
| **Model name** | Needed for route-level model identification and drift detection. |

## Optional but recommended

| Field | Why |
|---|---|
| **Token usage** | Token counts enable accurate waste estimation. |
| **Cache read / creation tokens** | Direct measurement of cache hit rate. |
| **Provider metadata** | Helps detect model/provider drift. |
| **Cost data** | Enables accurate USD waste estimates. |

---

## Langfuse

**Auth:** Basic auth with `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY`.
Pass as `--key publicKey:secretKey` to the CLI.

**Base URL:** `https://cloud.langfuse.com` (override with
`LANGFUSE_BASE_URL` for self-hosted).

**Endpoints used:**
- `GET /api/public/projects` — list projects
- `GET /api/public/v2/observations` — fetch GENERATION observations
  (cursor-based pagination, default limit 50, max 1000)

**Run type:** only `type = "GENERATION"` observations are analyzed.
Other types (`SPAN`, `EVENT`) are skipped.

**Required fields per observation:**
- `input` (object with `messages` array, or plain `prompt`/`text` string)
- `providedModelName` (or `modelParameters.model`)
- `usageDetails.input` / `usageDetails.output` (for token telemetry)
- `startTime` (for the time-window filter)

**Cache telemetry fields (optional):**
- `usageDetails.cacheRead` / `usageDetails.cache_read`
- `usageDetails.cacheCreation` / `usageDetails.cache_creation_input`
- `costDetails.total`

**Example observation:**

```json
{
  "id": "obs-1",
  "traceId": "trace-1",
  "type": "GENERATION",
  "name": "llm-generation",
  "providedModelName": "gpt-4o",
  "input": {
    "messages": [
      { "role": "system", "content": "You are helpful." },
      { "role": "user", "content": "Hi" }
    ]
  },
  "output": { "role": "assistant", "content": "Hello!" },
  "usageDetails": { "input": 50, "output": 10, "total": 60, "cacheRead": 20 },
  "costDetails": { "total": 0.0003 },
  "startTime": "2026-06-29T12:00:00Z"
}
```

---

## Braintrust

**Auth:** Bearer token (`BRAINTRUST_API_KEY`).

**Base URL:** `https://api.braintrust.dev` (US) or
`https://api-eu.braintrust.dev` (EU) or your self-hosted data plane.
Override with `BRAINTRUST_BASE_URL`.

**Endpoints used:**
- `GET /v1/project` — list projects
- `POST /btql` — run SQL queries against `project_logs('id', shape => 'spans')`

**Run type:** only spans with `span_attributes.type = 'llm'` are analyzed.

**Required fields per span:**
- `span_attributes.name` (used as the route name)
- `input` (object with `messages` array, or plain `prompt`/`text` string)
- `metadata.model` (or `modelParameters.model`)
- `metrics.prompt_tokens` / `metrics.completion_tokens` (for token telemetry)
- `created` (for the time-window filter)

**Cache telemetry fields (optional):**
- `metrics.prompt_cached_tokens`
- `metrics.prompt_cache_creation_tokens`
- `metrics.estimated_cost`

**Example BTQL query (what Cachecatch runs):**

```sql
SELECT
  id,
  root_span_id,
  span_attributes,
  input,
  output,
  metadata,
  metrics,
  created,
  tags
FROM project_logs('<PROJECT_ID>', shape => 'spans')
WHERE span_attributes.type = 'llm'
  AND created > now() - interval 7 day
ORDER BY created DESC
LIMIT 300
```

---

## LangSmith

See `langsmith-data-requirements.md` for full details.

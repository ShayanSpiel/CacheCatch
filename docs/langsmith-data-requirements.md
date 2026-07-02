# LangSmith Data Requirements

For Cachecatch to produce an accurate audit, LangSmith runs should
include the following data.

## Required

| Field | Why |
|---|---|
| **Rendered prompts / messages** | The prompt text is needed to detect cache breakers (timestamps, request IDs, dynamic metadata). Without this, Cachecatch cannot analyze prompt structure. |
| **Run type = "llm"** | Only LLM runs are analyzed. Other run types (chain, tool, retriever) are skipped. |

## Highly recommended

| Field | Why |
|---|---|
| **Token usage** (`prompt_tokens` / `completion_tokens`) | Token counts enable accurate waste estimation. Without them, estimates are based on approximate token counts derived from text length. |
| **Model name** | Needed for route-level model identification and drift detection. |

## Improves confidence

| Field | Why |
|---|---|
| **Cached token usage** (`cached_prompt_tokens`, `cache_read_input_tokens`) | Direct measurement of prompt cache hits provides the most accurate cache hit rate. When this is unavailable, Cachecatch infers cache behavior from prompt similarity between consecutive runs. |
| **Provider metadata** | Helps detect model/provider drift within routes. |
| **Cost data** | Enables more accurate waste calculation. When missing, Cachecatch uses default pricing heuristics. |

## Impact of missing data

| Missing field | Impact on report |
|---|---|
| Rendered prompts | Report confidence drops to **low**. No prompt analysis possible. |
| Token usage | Waste estimates become **approximate** (based on text length heuristics). |
| Cached token usage | Cache hit rate is **inferred** from prefix similarity rather than measured directly. Confidence drops to **medium**. |

## Report confidence levels

| Confidence | Conditions |
|---|---|
| **High** | Rendered prompts + cached token usage available |
| **Medium** | Rendered prompts + token usage available (no cached token data) |
| **Low** | Missing rendered prompts or token usage |

## API endpoint details

Cachecatch uses the LangSmith public API:

- Base URL: `https://api.smith.langchain.com` (override with
  `LANGSMITH_BASE_URL` for self-hosted)
- Auth header: `X-Api-Key`
- Endpoints used:
  - `GET /api/v1/sessions` — list projects / resolve project ID
  - `POST /api/v1/runs/query` — fetch LLM runs (paginated, 100 per page)

The MVP caps at 300 runs per audit (configurable via `--limit`).

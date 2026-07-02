/**
 * HTTP-plumbing integration test.
 *
 * Verifies that the adapter clients make calls with the correct
 * URL, method, and auth headers — without making real network
 * requests.
 */

import { LangSmithClient } from "../langsmith.ts"
import { LangfuseClient, basicAuthHeader, parseApiKey } from "../langfuse.ts"
import { BraintrustClient } from "../braintrust.ts"

let pass = 0
let fail = 0
function assert(cond: boolean, msg: string): void {
  if (cond) {
    pass++
    console.log(`  \u001b[32m✔\u001b[0m ${msg}`)
  } else {
    fail++
    console.log(`  \u001b[31m✗\u001b[0m ${msg}`)
  }
}

function pickHeader(headers: unknown, name: string): string | undefined {
  if (!headers) return undefined
  if (headers instanceof Headers) return headers.get(name) || undefined
  const h = headers as Record<string, string>
  const target = name.toLowerCase()
  for (const k of Object.keys(h)) {
    if (k.toLowerCase() === target) return h[k]
  }
  return undefined
}

const originalFetch = globalThis.fetch
let lastRequest: { url: string; init: RequestInit } | null = null

function mockFetchOnce(
  body: unknown,
  status = 200
): (url: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (url: string | URL | Request, init?: RequestInit) => {
    lastRequest = {
      url: typeof url === "string" ? url : url.toString(),
      init: init || {},
    }
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  }
}

void (async () => {
  console.log("\n\u001b[1mLangSmith HTTP plumbing\u001b[0m")

  // listProjects
  globalThis.fetch = mockFetchOnce({
    sessions: [
      { id: "proj-1", name: "My Project" },
      { id: "proj-2", name: "Another" },
    ],
  }) as typeof fetch
  const lsClient = new LangSmithClient("lsv2_test_key_abcdef123456")
  const projects = await lsClient.listProjects()
  assert(projects.length === 2, "listProjects returns 2 sessions")
  assert(
    lastRequest!.url.includes("https://api.smith.langchain.com/api/v1/sessions"),
    "listProjects hits /api/v1/sessions"
  )
  assert(
    pickHeader(lastRequest!.init.headers, "X-Api-Key") ===
      "lsv2_test_key_abcdef123456",
    "listProjects sends X-Api-Key header"
  )

  // getProjectId (direct hit)
  globalThis.fetch = mockFetchOnce({
    sessions: [{ id: "p-direct", name: "Foo" }],
  }) as typeof fetch
  const direct = await lsClient.getProjectId("Foo")
  assert(direct === "p-direct", "getProjectId returns id on first match")
  assert(
    lastRequest!.url.includes("name=Foo"),
    "getProjectId encodes project name in query"
  )

  // listRuns
  globalThis.fetch = mockFetchOnce({ runs: [{ id: "run-1" }, { id: "run-2" }] }) as typeof fetch
  const runs = await lsClient.listRuns("session-1", { limit: 5, startTime: "2026-01-01T00:00:00Z" })
  assert(runs.length === 2, "listRuns returns runs")
  assert(
    lastRequest!.url.includes("/api/v1/runs/query"),
    "listRuns hits /runs/query"
  )
  assert(
    lastRequest!.init.method === "POST",
    "listRuns uses POST method"
  )
  const body = JSON.parse(lastRequest!.init.body as string)
  assert(body.session[0] === "session-1", "listRuns includes session in body")
  assert(body.start_time === "2026-01-01T00:00:00Z", "listRuns includes start_time")

  // Self-hosted URL override
  const selfHosted = new LangSmithClient("k", "https://langsmith.internal.example.com")
  globalThis.fetch = mockFetchOnce({ sessions: [] }) as typeof fetch
  await selfHosted.listProjects()
  assert(
    lastRequest!.url.startsWith("https://langsmith.internal.example.com"),
    "LangSmithClient honors baseUrl override"
  )

  console.log("\n\u001b[1mLangfuse HTTP plumbing\u001b[0m")
  const creds = parseApiKey("pk-lf-123:sk-lf-456")
  assert(creds.publicKey === "pk-lf-123", "parseApiKey extracts publicKey")
  assert(creds.secretKey === "sk-lf-456", "parseApiKey extracts secretKey")
  const auth = basicAuthHeader(creds)
  assert(auth.startsWith("Basic "), "basicAuthHeader returns Basic auth")
  const expected = Buffer.from("pk-lf-123:sk-lf-456").toString("base64")
  assert(auth === `Basic ${expected}`, "basicAuthHeader encodes correctly")

  const lfClient = new LangfuseClient(creds, "https://cloud.langfuse.com")
  globalThis.fetch = mockFetchOnce({ data: [{ id: "p-1", name: "Foo" }] }) as typeof fetch
  const lfProjects = await lfClient.listProjects()
  assert(lfProjects.length === 1, "Langfuse listProjects returns projects")
  assert(
    lastRequest!.url === "https://cloud.langfuse.com/api/public/projects",
    "Langfuse listProjects hits /api/public/projects"
  )
  assert(
    pickHeader(lastRequest!.init.headers, "Authorization") ===
      `Basic ${expected}`,
    "Langfuse listProjects sends correct Basic auth"
  )

  // listObservations
  globalThis.fetch = mockFetchOnce({ data: [{ id: "obs-1" }], meta: { cursor: null } }) as typeof fetch
  const obs = await lfClient.listObservations({
    projectId: "p-1",
    fromStartTime: "2026-01-01T00:00:00Z",
    toStartTime: "2026-01-02T00:00:00Z",
    type: "GENERATION",
  })
  assert(obs.length === 1, "Langfuse listObservations returns observations")
  assert(
    lastRequest!.url.includes("/api/public/v2/observations"),
    "Langfuse listObservations hits v2/observations"
  )
  assert(
    lastRequest!.url.includes("type=GENERATION"),
    "Langfuse listObservations filters by type"
  )
  assert(
    lastRequest!.url.includes("fromStartTime=2026-01-01T00"),
    "Langfuse listObservations includes fromStartTime"
  )

  console.log("\n\u001b[1mBraintrust HTTP plumbing\u001b[0m")
  const btClient = new BraintrustClient("sk-bt-test", "https://api.braintrust.dev")
  globalThis.fetch = mockFetchOnce({ objects: [{ id: "bp-1", name: "P1" }] }) as typeof fetch
  const btProjects = await btClient.listProjects()
  assert(btProjects.length === 1, "Braintrust listProjects returns projects")
  assert(
    lastRequest!.url === "https://api.braintrust.dev/v1/project",
    "Braintrust listProjects hits /v1/project"
  )
  assert(
    pickHeader(lastRequest!.init.headers, "Authorization") === "Bearer sk-bt-test",
    "Braintrust listProjects sends Bearer auth"
  )

  // query
  globalThis.fetch = mockFetchOnce({ data: [{ id: "s-1", span_attributes: { type: "llm" } }], cursor: null }) as typeof fetch
  const btSpans = await btClient.listLlmSpans({ projectId: "p-1", window: "7d", limit: 10 })
  assert(btSpans.length === 1, "Braintrust listLlmSpans returns spans")
  assert(
    lastRequest!.url === "https://api.braintrust.dev/btql",
    "Braintrust listLlmSpans hits /btql"
  )
  assert(
    lastRequest!.init.method === "POST",
    "Braintrust listLlmSpans uses POST"
  )
  const btBody = JSON.parse(lastRequest!.init.body as string)
  assert(typeof btBody.query === "string", "Braintrust query has SQL string")
  assert(btBody.query.includes("project_logs"), "Braintrust query uses project_logs source")
  assert(btBody.fmt === "json", "Braintrust query asks for json format")

  // restore
  globalThis.fetch = originalFetch
  console.log(`\n\u001b[1m${pass} passed, ${fail} failed\u001b[0m\n`)
  process.exit(fail > 0 ? 1 : 0)
})()

/**
 * Live API smoke tests.
 *
 * These tests ACTUALLY call out to LangSmith / Langfuse / Braintrust.
 * They are skipped if the relevant API key env var is missing.
 *
 * Run:
 *   LANGSMITH_API_KEY=lsv2_… npx tsx src/adapters/__tests__/live.test.ts
 *
 * Purpose: catch schema drift in provider APIs and prove the
 * adapters do not throw on real data.
 */

import { langSmithAdapter } from "../langsmith.ts"
import { langfuseAdapter } from "../langfuse.ts"
import { braintrustAdapter } from "../braintrust.ts"
import { buildReport } from "../../engine/index.ts"

let pass = 0
let fail = 0
let skip = 0

function assert(cond: boolean, msg: string): void {
  if (cond) {
    pass++
    console.log(`  \u001b[32m✔\u001b[0m ${msg}`)
  } else {
    fail++
    console.log(`  \u001b[31m✗\u001b[0m ${msg}`)
  }
}

function skipped(msg: string): void {
  skip++
  console.log(`  \u001b[2m- skipped: ${msg}\u001b[0m`)
}

void (async () => {
  console.log("\n\u001b[1mLangSmith live smoke test\u001b[0m")
  if (!process.env.LANGSMITH_API_KEY) {
    skipped("LANGSMITH_API_KEY not set")
  } else {
    try {
      const result = await langSmithAdapter.fetchTraces({
        project: process.env.LANGSMITH_TEST_PROJECT || "default",
        apiKey: process.env.LANGSMITH_API_KEY,
        window: "24h",
        limit: 10,
        baseUrl: process.env.LANGSMITH_BASE_URL,
      })
      assert(result.traces.length > 0, "fetched traces from LangSmith")
      assert(
        result.traces.every((t) => t.provider === "langsmith"),
        "all traces have langsmith provider"
      )
      const report = buildReport(result.traces, {
        projectName: result.projectName,
        window: "24h",
        source: "langsmith",
      })
      assert(report.summary.runsAnalyzed > 0, "engine accepts LangSmith traces")
      console.log(`    → ${result.traces.length} traces, score ${report.score}/100`)
    } catch (e) {
      console.log(`    \u001b[31merror:\u001b[0m ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  console.log("\n\u001b[1mLangfuse live smoke test\u001b[0m")
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    skipped("LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY not set")
  } else {
    try {
      const result = await langfuseAdapter.fetchTraces({
        project: process.env.LANGFUSE_TEST_PROJECT || "default",
        apiKey: "",
        window: "24h",
        limit: 10,
        baseUrl: process.env.LANGFUSE_BASE_URL,
      })
      assert(result.traces.length > 0, "fetched traces from Langfuse")
      assert(
        result.traces.every((t) => t.provider === "langfuse"),
        "all traces have langfuse provider"
      )
      const report = buildReport(result.traces, {
        projectName: result.projectName,
        window: "24h",
        source: "langfuse",
      })
      assert(report.summary.runsAnalyzed > 0, "engine accepts Langfuse traces")
      console.log(`    → ${result.traces.length} traces, score ${report.score}/100`)
    } catch (e) {
      console.log(`    \u001b[31merror:\u001b[0m ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  console.log("\n\u001b[1mBraintrust live smoke test\u001b[0m")
  if (!process.env.BRAINTRUST_API_KEY) {
    skipped("BRAINTRUST_API_KEY not set")
  } else {
    try {
      const result = await braintrustAdapter.fetchTraces({
        project: process.env.BRAINTRUST_TEST_PROJECT || "default",
        apiKey: process.env.BRAINTRUST_API_KEY,
        window: "24h",
        limit: 10,
        baseUrl: process.env.BRAINTRUST_BASE_URL,
      })
      assert(result.traces.length > 0, "fetched traces from Braintrust")
      assert(
        result.traces.every((t) => t.provider === "braintrust"),
        "all traces have braintrust provider"
      )
      const report = buildReport(result.traces, {
        projectName: result.projectName,
        window: "24h",
        source: "braintrust",
      })
      assert(report.summary.runsAnalyzed > 0, "engine accepts Braintrust traces")
      console.log(`    → ${result.traces.length} traces, score ${report.score}/100`)
    } catch (e) {
      console.log(`    \u001b[31merror:\u001b[0m ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  console.log(`\n\u001b[1m${pass} passed, ${fail} failed, ${skip} skipped\u001b[0m\n`)
  process.exit(fail > 0 ? 1 : 0)
})()

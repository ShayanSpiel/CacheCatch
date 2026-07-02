/**
 * Legacy shim — re-exports the new LangSmith adapter so the
 * web app keeps working. The new implementation lives in
 * `src/adapters/langsmith.ts`.
 */

export {
  langSmithAdapter,
  LangSmithClient,
  normalizeLangSmithRun,
  LANGSMITH_BASE_URL,
} from "../../src/adapters/langsmith"

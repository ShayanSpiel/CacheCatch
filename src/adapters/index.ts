/**
 * Adapter registry.
 *
 * New providers plug in here. The CLI auto-discovers commands
 * (`cachecatch audit <provider> ...`) from this map.
 */

import { langSmithAdapter } from "./langsmith.ts"
import { langfuseAdapter } from "./langfuse.ts"
import { braintrustAdapter } from "./braintrust.ts"
import { mockAdapter } from "./mock.ts"
import type { Provider, ProviderAdapter } from "../types/index.ts"

export { langSmithAdapter } from "./langsmith.ts"
export { langfuseAdapter } from "./langfuse.ts"
export { braintrustAdapter } from "./braintrust.ts"
export { mockAdapter } from "./mock.ts"

export const ADAPTERS: Record<Provider, ProviderAdapter> = {
  langsmith: langSmithAdapter,
  langfuse: langfuseAdapter,
  braintrust: braintrustAdapter,
  mock: mockAdapter,
  sample: mockAdapter,
}

export function getAdapter(provider: Provider): ProviderAdapter {
  const adapter = ADAPTERS[provider]
  if (!adapter) {
    const known = Object.keys(ADAPTERS).join(", ")
    throw new Error(
      `Unknown provider: "${provider}". Known: ${known}`
    )
  }
  return adapter
}

export const PROVIDER_NAMES: Provider[] = [
  "langsmith",
  "langfuse",
  "braintrust",
]

/**
 * `cachecatch projects` — list projects available for a provider.
 * Useful for discovering project names/IDs before running an audit.
 */

import { Command } from "commander"
import chalk from "chalk"
import ora from "ora"
import { getAdapter, ADAPTERS } from "../../adapters/index.ts"
import { withErrorHandling, fail } from "../utils.ts"
import type { Provider } from "../../types/index.ts"
import { loadDotenv } from "../../util/http.ts"

interface ProjectsFlags {
  provider: Provider
  key?: string
  baseUrl?: string
  json?: boolean
}

export function makeProjectsCommand(): Command {
  const cmd = new Command("projects")
    .description("List projects available for a given provider.")
    .option("-p, --provider <provider>", "Provider: langsmith | langfuse | braintrust", "langsmith")
    .option("-k, --key <key>", "API key (or use env vars)")
    .option("--base-url <url>", "Override provider base URL")
    .option("--json", "Print raw JSON to stdout")
    .action(async (flags: ProjectsFlags) => {
      await withErrorHandling(async () => {
        loadDotenv()
        const provider = flags.provider
        if (!ADAPTERS[provider]) {
          fail(`Unknown provider "${provider}".`)
        }
        const adapter = getAdapter(provider)

        const envVar = envVarForProvider(provider)
        const apiKey =
          flags.key || (envVar ? process.env[envVar] || "" : "")

        if (provider === "langsmith" && !apiKey) {
          fail(`No API key. Pass --key or set LANGSMITH_API_KEY.`)
        }
        if (provider === "langfuse") {
          if (!apiKey && !(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY)) {
            fail(
              `No Langfuse credentials. Pass --key publicKey:secretKey or set LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY.`
            )
          }
        }
        if (provider === "braintrust" && !apiKey) {
          fail(`No API key. Pass --key or set BRAINTRUST_API_KEY.`)
        }

        const spinner = ora({
          text: chalk.cyan(`Fetching projects from ${adapter.displayName}…`),
          color: "cyan",
        }).start()

        try {
          // We need a raw client. Use resolveProject as a probe by listing
          // — but the adapter contract doesn't expose a "list" method.
          // So we use a small inline call to the provider's list method.
          const projects = await listProjectsForProvider(provider, apiKey, flags.baseUrl)
          spinner.succeed(
            chalk.greenBright(`Found ${projects.length} project(s)`)
          )

          if (flags.json) {
            process.stdout.write(JSON.stringify(projects, null, 2) + "\n")
          } else {
            if (projects.length === 0) {
              process.stdout.write(chalk.gray("\n(no projects)\n"))
            } else {
              const max = Math.max(...projects.map((p) => p.name.length))
              for (const p of projects) {
                process.stdout.write(
                  `  ${chalk.cyan(p.name.padEnd(max))}  ${chalk.gray(p.id)}\n`
                )
              }
            }
          }
        } catch (e) {
          spinner.fail(chalk.redBright("List failed"))
          throw e
        }
      })
    })

  return cmd
}

async function listProjectsForProvider(
  provider: Provider,
  apiKey: string,
  baseUrl?: string
): Promise<Array<{ id: string; name: string }>> {
  if (provider === "langsmith") {
    const { LangSmithClient } = await import("../../adapters/langsmith.ts")
    const client = new LangSmithClient(apiKey, baseUrl)
    const list = await client.listProjects()
    return list.map((p) => ({ id: p.id, name: p.name }))
  }
  if (provider === "langfuse") {
    const { LangfuseClient, parseApiKey } = await import(
      "../../adapters/langfuse.ts"
    )
    const creds = apiKey.includes(":")
      ? parseApiKey(apiKey)
      : {
          publicKey: process.env.LANGFUSE_PUBLIC_KEY || "",
          secretKey: process.env.LANGFUSE_SECRET_KEY || "",
        }
    const client = new LangfuseClient(creds, baseUrl || process.env.LANGFUSE_BASE_URL)
    return await client.listProjects()
  }
  if (provider === "braintrust") {
    const { BraintrustClient } = await import("../../adapters/braintrust.ts")
    const client = new BraintrustClient(apiKey, baseUrl)
    return await client.listProjects()
  }
  return []
}

function envVarForProvider(provider: Provider): string | null {
  switch (provider) {
    case "langsmith":
      return "LANGSMITH_API_KEY"
    case "langfuse":
      return "LANGFUSE_PUBLIC_KEY"
    case "braintrust":
      return "BRAINTRUST_API_KEY"
    default:
      return null
  }
}

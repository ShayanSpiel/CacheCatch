/**
 * `cachecatch config` — set / show / unset API keys and base URLs
 * for each provider. Writes to `.env` in the current working directory.
 */

import { Command } from "commander"
import chalk from "chalk"
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs"
import { withErrorHandling, fail } from "../utils.ts"
import { PROVIDER_NAMES } from "../../adapters/index.ts"

interface GetFlags {
  provider?: string
}

const ENV_PATH = ".env"

function readEnv(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {}
  const text = readFileSync(ENV_PATH, "utf-8")
  const out: Record<string, string> = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq === -1) continue
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[line.slice(0, eq).trim()] = value
  }
  return out
}

function setEnvVar(key: string, value: string): void {
  const env = readEnv()
  env[key] = value
  const out =
    "# Cachecatch CLI configuration\n" +
    Object.entries(env)
      .map(([k, v]) => `${k}=${v.includes(" ") ? `"${v}"` : v}`)
      .join("\n") +
    "\n"
  writeFileSync(ENV_PATH, out, "utf-8")
}

function appendEnvVar(key: string, value: string): void {
  appendFileSync(ENV_PATH, `\n${key}=${value.includes(" ") ? `"${value}"` : value}\n`, "utf-8")
}

function redact(value: string): string {
  if (!value) return "(not set)"
  if (value.length <= 8) return "****"
  return value.slice(0, 4) + "…" + value.slice(-4)
}

export function makeConfigCommand(): Command {
  const cmd = new Command("config")
    .description("Manage Cachecatch CLI configuration (API keys, base URLs).")

  cmd
    .command("set-key")
    .description("Save an API key for a provider to .env")
    .argument("<provider>", `Provider: ${PROVIDER_NAMES.join(", ")}`)
    .argument("<key>", "API key value (use publicKey:secretKey for Langfuse)")
    .action((provider: string, key: string) =>
      withErrorHandling(async () => {
        const envKey = envKeyForProvider(provider)
        if (!envKey) {
          fail(`Unknown provider "${provider}".`)
        }
        if (key.includes(" ")) fail("API key cannot contain spaces.")
        if (provider === "langfuse") {
          const [publicKey, secretKey] = key.split(":", 2)
          if (!publicKey || !secretKey) {
            fail(
              "Langfuse requires both keys. Use `cachecatch config set-key langfuse publicKey:secretKey` or set LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY."
            )
          }
          setEnvVar("LANGFUSE_PUBLIC_KEY", publicKey)
          setEnvVar("LANGFUSE_SECRET_KEY", secretKey)
          process.stdout.write(
            chalk.greenBright(
              `✔ Saved LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY to ${ENV_PATH} (redacted: ${redact(publicKey)}:${redact(secretKey)})\n`
            )
          )
          return
        }
        try {
          setEnvVar(envKey, key)
        } catch {
          appendEnvVar(envKey, key)
        }
        process.stdout.write(
          chalk.greenBright(
            `✔ Saved ${envKey} to ${ENV_PATH} (redacted: ${redact(key)})\n`
          )
        )
      })
    )

  cmd
    .command("get")
    .description("Show currently configured values (keys redacted)")
    .option("-p, --provider <provider>", "Limit to a single provider")
    .action((flags: GetFlags) =>
      withErrorHandling(async () => {
        const env = readEnv()
        const providers = flags.provider ? [flags.provider] : [...PROVIDER_NAMES]
        for (const p of providers) {
          const mainKey = envKeyForProvider(p)
          const urlKey = envKeyForBaseUrl(p)
          process.stdout.write(
            chalk.cyan.bold(p) + "\n"
          )
          if (mainKey) {
            process.stdout.write(
              `  ${mainKey}: ${redact(env[mainKey] || process.env[mainKey] || "")}\n`
            )
          }
          if (p === "langfuse") {
            const secret = "LANGFUSE_SECRET_KEY"
            process.stdout.write(
              `  ${secret}: ${redact(env[secret] || process.env[secret] || "")}\n`
            )
          }
          if (urlKey) {
            process.stdout.write(
              `  ${urlKey}: ${env[urlKey] || process.env[urlKey] || "(default)"}\n`
            )
          }
        }
      })
    )

  cmd
    .command("set-url")
    .description("Override a provider's base URL (self-hosted / EU region)")
    .argument("<provider>", `Provider: ${PROVIDER_NAMES.join(", ")}`)
    .argument("<url>", "Base URL, e.g. https://api-eu.braintrust.dev")
    .action((provider: string, url: string) =>
      withErrorHandling(async () => {
        const envKey = envKeyForBaseUrl(provider)
        if (!envKey) fail(`Unknown provider "${provider}" or no URL override.`)
        try {
          setEnvVar(envKey, url)
        } catch {
          appendEnvVar(envKey, url)
        }
        process.stdout.write(
          chalk.greenBright(`✔ Saved ${envKey} = ${url}\n`)
        )
      })
    )

  return cmd
}

function envKeyForProvider(provider: string): string | null {
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

function envKeyForBaseUrl(provider: string): string | null {
  switch (provider) {
    case "langsmith":
      return "LANGSMITH_BASE_URL"
    case "langfuse":
      return "LANGFUSE_BASE_URL"
    case "braintrust":
      return "BRAINTRUST_BASE_URL"
    default:
      return null
  }
}

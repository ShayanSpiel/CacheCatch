/**
 * Interactive prompts for the CLI.
 *
 * Wraps @inquirer/prompts with a non-TTY fallback. When stdin is not
 * a TTY (CI, piped input, automated runs), all prompts throw a
 * "non-interactive mode" error so the user knows to pass the
 * required flag explicitly.
 */

import { password, input, confirm, select } from "@inquirer/prompts"
import chalk from "chalk"

const PROVIDER_LABELS: Record<string, string> = {
  langsmith: "LangSmith",
  langfuse: "Langfuse",
  braintrust: "Braintrust",
}

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY)
}

export class NonInteractiveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NonInteractiveError"
  }
}

function ensureInteractive(label: string): void {
  if (!isInteractive()) {
    throw new NonInteractiveError(
      `Cannot prompt for ${label} in non-interactive mode. Pass --key or set the env var.`
    )
  }
}

export interface ApiKeyPromptOptions {
  provider: string
  envVar: string
  hint?: string
}

/**
 * Mask-prompt for an API key. Falls back gracefully when the
 * terminal can't mask (CI, redirected stdin).
 */
export async function promptForApiKey(
  options: ApiKeyPromptOptions
): Promise<string> {
  ensureInteractive(`API key for ${options.provider}`)
  const providerLabel = PROVIDER_LABELS[options.provider] || options.provider
  process.stdout.write(
    chalk.yellow(
      `\n🔐 Please enter your ${providerLabel} API Key (it will never be stored):\n`
    )
  )
  if (options.hint) {
    process.stdout.write(chalk.gray(`   ${options.hint}\n`))
  }
  const key = await password({
    message: `${providerLabel} API Key:`,
    mask: "*",
    validate: (v: string) => {
      if (!v || v.trim().length === 0) {
        return "API key cannot be empty."
      }
      if (v.includes(" ")) {
        return "API key cannot contain spaces."
      }
      return true
    },
  })
  return key.trim()
}

export async function promptForProject(
  provider: string,
  defaultValue?: string
): Promise<string> {
  ensureInteractive(`project name for ${provider}`)
  return input({
    message: `Project name on ${provider}:`,
    default: defaultValue,
    validate: (v: string) => (v && v.trim().length > 0 ? true : "Project is required."),
  })
}

export type AuditWindowValue = "24h" | "7d" | "30d" | "1y"

export async function promptForWindow(
  defaultValue: AuditWindowValue = "7d"
): Promise<AuditWindowValue> {
  ensureInteractive("time window")
  return select<AuditWindowValue>({
    message: "Time window to audit:",
    default: defaultValue,
    choices: [
      { name: "Last 24 hours (24h)", value: "24h" },
      { name: "Last 7 days (7d) — recommended", value: "7d" },
      { name: "Last 30 days (30d)", value: "30d" },
      { name: "Last year (1y)", value: "1y" },
    ],
  })
}

export async function confirmAction(
  message: string,
  defaultValue: boolean = true
): Promise<boolean> {
  if (!isInteractive()) return defaultValue
  return confirm({ message, default: defaultValue })
}

/**
 * Resolves the API key for a provider. Order of precedence:
 * 1. Explicit `key` argument
 * 2. Environment variable
 * 3. Saved `.env` file (loaded by caller)
 * 4. Interactive prompt
 */
export async function resolveApiKey(
  provider: string,
  envVar: string,
  explicitKey?: string
): Promise<string> {
  if (explicitKey && explicitKey.length > 0) return explicitKey
  const fromEnv = process.env[envVar]
  if (fromEnv && fromEnv.length > 0) return fromEnv
  // Special-case: Langfuse needs both public + secret
  if (provider === "langfuse") {
    const pk = process.env.LANGFUSE_PUBLIC_KEY
    const sk = process.env.LANGFUSE_SECRET_KEY
    if (pk && sk) return `${pk}:${sk}`
  }
  return promptForApiKey({
    provider,
    envVar,
    hint:
      provider === "langfuse"
        ? "(format: publicKey:secretKey)"
        : undefined,
  })
}

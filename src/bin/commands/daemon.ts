import { createServer, type IncomingMessage } from "node:http"
import { spawn } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, appendFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { Command } from "commander"
import chalk from "chalk"
import { configureColor, withErrorHandling } from "../utils.ts"

const HOST = "127.0.0.1"
const PORT = 4318

function telemetryDir(agent: "codex" | "claude-code"): string {
  return join(homedir(), ".cachecatch", "telemetry", agent)
}

function pidPath(): string {
  return join(homedir(), ".cachecatch", "telemetry", "daemon.pid")
}

function bodyChunks(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => resolve(Buffer.concat(chunks)))
    req.on("error", reject)
  })
}

function redactPrompts(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactPrompts)
  if (!value || typeof value !== "object") return value
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/prompt|content|response|raw_api|body|message/i.test(key)) out[key] = "[redacted]"
    else out[key] = redactPrompts(child)
  }
  return out
}

function inferAgent(url: string | undefined, bodyText: string): "codex" | "claude-code" {
  const haystack = `${url ?? ""}\n${bodyText.slice(0, 4000)}`.toLowerCase()
  if (haystack.includes("claude_code") || haystack.includes("claude-code")) return "claude-code"
  return "codex"
}

function writeTelemetry(agent: "codex" | "claude-code", record: unknown): void {
  const dir = telemetryDir(agent)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${new Date().toISOString().slice(0, 10)}.jsonl`)
  appendFileSync(file, `${JSON.stringify(record)}\n`, "utf-8")
}

function startDaemon(debugRaw: boolean): void {
  mkdirSync(join(homedir(), ".cachecatch", "telemetry"), { recursive: true })
  writeFileSync(pidPath(), `${process.pid}\n`, "utf-8")
  const server = createServer(async (req, res) => {
    try {
      const body = await bodyChunks(req)
      const contentType = String(req.headers["content-type"] ?? "")
      const bodyText = body.toString("utf-8")
      const agent = inferAgent(req.url, bodyText)
      let payload: unknown
      if (contentType.includes("json")) {
        try {
          payload = JSON.parse(bodyText)
        } catch {
          payload = { malformedJsonBytes: body.length }
        }
      } else {
        payload = debugRaw
          ? { rawBase64: body.toString("base64"), byteLength: body.length }
          : { binaryOtlpBytes: body.length, rawBodyStored: false }
      }
      writeTelemetry(agent, {
        receivedAt: new Date().toISOString(),
        method: req.method,
        url: req.url,
        contentType,
        agent,
        payload: debugRaw ? payload : redactPrompts(payload),
      })
      res.writeHead(200, { "content-type": "application/json" })
      res.end('{"ok":true}\n')
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json" })
      res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }))
    }
  })
  server.listen(PORT, HOST, () => {
    process.stdout.write(chalk.greenBright(`Cachecatch daemon listening on http://${HOST}:${PORT}\n`))
    process.stdout.write(chalk.gray("Local only. Raw prompt-like JSON fields are redacted unless --debug-raw is set.\n"))
  })
}

function running(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function countRecentEvents(agent: "codex" | "claude-code"): { count: number; cacheFields: boolean; latestSource: string } {
  const dir = telemetryDir(agent)
  if (!existsSync(dir)) return { count: 0, cacheFields: false, latestSource: "none" }
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  let count = 0
  let cacheFields = false
  let latest = 0
  for (const file of readdirSync(dir)) {
    const path = join(dir, file)
    const stat = statSync(path)
    if (stat.mtimeMs < cutoff) continue
    latest = Math.max(latest, stat.mtimeMs)
    const text = readFileSync(path, "utf-8")
    count += text.split(/\r?\n/).filter(Boolean).length
    if (/cache_read|cacheRead|cached_input|cacheCreation|cache_creation/i.test(text)) cacheFields = true
  }
  return { count, cacheFields, latestSource: latest > 0 ? agent : "none" }
}

function printStatus(): void {
  let isRunning = false
  if (existsSync(pidPath())) {
    const pid = Number(readFileSync(pidPath(), "utf-8").trim())
    isRunning = Number.isFinite(pid) && running(pid)
  }
  const codexConfig = existsSync(join(homedir(), ".codex", "config.toml"))
  const claudeEnv = existsSync(join(homedir(), ".cachecatch", "claude-code-otel.env"))
  const codex = countRecentEvents("codex")
  const claude = countRecentEvents("claude-code")
  process.stdout.write(chalk.cyanBright.bold("Cachecatch telemetry status\n"))
  process.stdout.write(`Daemon: ${isRunning ? "running" : "not running"}\n`)
  process.stdout.write(`Local OTLP endpoints: http://${HOST}:${PORT}/v1/logs, http://${HOST}:${PORT}/v1/metrics\n`)
  process.stdout.write(`Codex config detected: ${codexConfig ? "yes" : "no"}\n`)
  process.stdout.write(`Claude env file detected: ${claudeEnv ? "yes" : "no"}\n`)
  process.stdout.write(`Events received last 24h: ${codex.count + claude.count}\n`)
  process.stdout.write(`Cache fields observed: ${codex.cacheFields || claude.cacheFields ? "yes" : "no"}\n`)
  process.stdout.write(`Latest observed agent telemetry source: ${claude.latestSource !== "none" ? claude.latestSource : codex.latestSource}\n`)
}

export function makeDaemonCommand(): Command {
  return new Command("daemon")
    .description("Receive local OTLP logs/metrics and write Cachecatch telemetry JSONL.")
    .option("--debug-raw", "Store raw binary bodies/base64 and unredacted JSON envelopes.")
    .option("--no-color", "Disable terminal colors")
    .action(async (flags: { debugRaw?: boolean; color?: boolean }) => {
      await withErrorHandling(async () => {
        configureColor(flags.color !== false)
        startDaemon(Boolean(flags.debugRaw))
      })
    })
}

export function makeTelemetryCommand(): Command {
  const cmd = new Command("telemetry")
    .description("Inspect local telemetry collector status.")

  cmd.command("status")
    .description("Show daemon/config/event status.")
    .action(async () => {
      await withErrorHandling(async () => {
        printStatus()
      })
    })

  return cmd
}

export function makeRunCommand(): Command {
  const cmd = new Command("run")
    .description("Run an agent with Cachecatch local telemetry defaults.")

  cmd.command("claude")
    .description("Load the generated Claude Code OTel env file and launch claude.")
    .allowUnknownOption(true)
    .argument("[args...]", "Arguments passed through to claude")
    .action(async (args: string[]) => {
      await withErrorHandling(async () => {
        const envPath = join(homedir(), ".cachecatch", "claude-code-otel.env")
        if (!existsSync(envPath)) {
          throw new Error("Claude env file not found. Run `npx --yes cachecatch init claude` first.")
        }
        const env = { ...process.env }
        for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
          const match = line.match(/^export\s+([A-Z0-9_]+)=(.*)$/)
          if (!match) continue
          env[match[1]] = match[2]
        }
        const child = spawn("claude", args, { stdio: "inherit", env })
        child.on("exit", (code) => process.exit(code ?? 0))
      })
    })

  return cmd
}

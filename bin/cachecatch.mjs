#!/usr/bin/env node
/**
 * Backward-compatible shim.
 *
 * Prefer the compiled `dist/index.js` (the package.json `bin` field).
 * This shim is kept so older `npx cachecatch …` invocations still work
 * in dev / unbuilt environments.
 */

import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")
const compiled = join(root, "dist", "index.js")

function runCompiled() {
  import(compiled).catch((err) => {
    console.error("[cachecatch] failed to run compiled CLI:", err)
    process.exit(1)
  })
}

if (existsSync(compiled)) {
  runCompiled()
} else {
  // Dev fallback: build first, then run the compiled CLI. This avoids
  // depending on tsx at runtime, which can fail when native esbuild was
  // installed for a different local architecture.
  const child = spawn("npm", ["run", "build:cli", "--silent"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  })
  child.on("exit", (code) => {
    if (code && code !== 0) process.exit(code)
    runCompiled()
  })
  child.on("error", (err) => {
    console.error("[cachecatch] failed to build CLI:", err.message)
    process.exit(1)
  })
}

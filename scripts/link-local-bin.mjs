#!/usr/bin/env node
import { existsSync, mkdirSync, rmSync, symlinkSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")

// Published installs get their bin linked by npm itself. This helper is for
// the repository checkout, where `npx cachecatch` expects node_modules/.bin.
if (root.includes(`${process.platform === "win32" ? "\\" : "/"}node_modules${process.platform === "win32" ? "\\" : "/"}`)) {
  process.exit(0)
}

const binDir = join(root, "node_modules", ".bin")
const target = join(root, "bin", "cachecatch.mjs")
const link = join(binDir, "cachecatch")

mkdirSync(binDir, { recursive: true })
if (existsSync(link)) rmSync(link, { force: true })

const relativeTarget = relative(binDir, target)
symlinkSync(relativeTarget, link)

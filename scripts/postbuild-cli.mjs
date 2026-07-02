#!/usr/bin/env node
/**
 * Post-build step for the CLI.
 *
 * Moves `dist/bin/index.js` → `dist/index.js` so the
 * package.json `bin` field points at the conventional root path.
 * Also rewrites the entry's import path to point at the new
 * `./src/bin/cachecatch.js` location.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync, chmodSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")
const srcEntry = join(root, "dist", "bin", "index.js")
const dstEntry = join(root, "dist", "index.js")

if (!existsSync(srcEntry)) {
  console.error(`[postbuild] expected ${srcEntry} to exist`)
  process.exit(1)
}

// Read the compiled entry, fix the import path, then move
let code = readFileSync(srcEntry, "utf-8")
// After tsc compiles, the path "../src/bin/cachecatch.js" needs
// to become "./src/bin/cachecatch.js" once index.js lives at
// dist/index.js (not dist/bin/index.js). tsc may emit either
// `import x from "..."` or a side-effect `import "..."` form.
code = code.replace(
  /(["'])\.\.\/src\/bin\/cachecatch\.js\1/g,
  `"./src/bin/cachecatch.js"`
)

mkdirSync(dirname(dstEntry), { recursive: true })
writeFileSync(dstEntry, code, "utf-8")
chmodSync(dstEntry, 0o755)

// Remove the now-empty dist/bin/ directory
const binDir = join(root, "dist", "bin")
if (existsSync(binDir)) rmSync(binDir, { recursive: true, force: true })

const size = statSync(dstEntry).size
console.log(`[postbuild] CLI ready at dist/index.js (${(size / 1024).toFixed(1)} kB)`)

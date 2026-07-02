#!/usr/bin/env node
/**
 * Cachecatch CLI — production entry point.
 *
 * This file is compiled to `dist/index.js` by `npm run build:cli`.
 * The shebang at the top makes the output directly executable via
 * `npx cachecatch` or as a globally-installed `cachecatch` binary.
 *
 * The actual CLI logic lives in `src/bin/cachecatch.ts` so it
 * stays type-checked alongside the rest of the project.
 */

import "../src/bin/cachecatch.ts"

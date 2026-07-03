# Cachecatch — Agent Instructions

## Overview

Cachecatch is the **first prompt-cache audit and optimization tool for AI agents**. It covers both local IDE agent sessions (Claude Code, Codex, OpenCode) and production platform traces (LangSmith, Langfuse, Braintrust).

Cachecatch audits traces, detects prompt-cache breakers, estimates recoverable token spend, and gives exact fixes — route by route, prompt layout by prompt layout.

It ships as **both** a CLI-first infrastructure tool and a Next.js web
app. The CLI and the web app share one engine, one set of adapters, and
one `CachecatchReport` schema.

## Tech Stack

- **Next.js 16 App Router** (web app — kept intentionally thin)
- **TypeScript** (strict)
- **Tailwind CSS v4** + **shadcn/ui** (web app only)
- **Commander.js** + **chalk** + **boxen** + **ora** (CLI)
- **tsx** (zero-build TypeScript execution for the CLI)
- **zod** for validation

## Repository layout

```
src/
  bin/                # CLI entry point + commands (audit, sample, export, projects, config, share)
  adapters/           # Provider-specific I/O (langsmith, langfuse, braintrust, mock)
  engine/             # Provider-agnostic analysis + local IDE agent audit
  reporting/          # Terminal (chalk + boxen), HTML, and cloud/local X card renderers
  types/              # Shared interfaces — NormalizedTrace and reports are canonical
  util/               # HTTP helpers (fetchWithRetry, dotenv loader, asNumber, etc.)

lib/                  # Legacy web-app shims that re-export from src/
  cachecatch/*        # → src/engine/*
  langsmith/*         # → src/adapters/langsmith.ts

app/                  # Next.js pages + API routes (web app)
components/           # React UI for the web report
docs/                 # Product contract, data requirements, future architecture
```

## Key rules

- **Do NOT add auth, database, billing, or persistent storage.**
- **Do NOT build full observability** — Cachecatch is a *cache audit* tool.
- **Do NOT duplicate logic** — every piece of analysis lives in `src/engine/*`.
  The web app and CLI both import from there.
- **`src/engine/*` must be provider-agnostic** — no LangSmith / Langfuse /
  Braintrust imports allowed. Only `NormalizedTrace` types cross the
  provider boundary. Local filesystem session scanning belongs in
  `src/engine/local-agent-audit.ts` and produces a `LocalAgentReport`.
- **`src/adapters/*` is the only place** that knows about provider HTTP APIs.
- **Adding a new provider** is a single new file in `src/adapters/` plus a
  line in `src/adapters/index.ts` to register it. The CLI auto-discovers
  it via `getAdapter(provider)`.
- **UI components must not contain audit logic** — they consume a
  `CachecatchReport` and render it. The web UI lives in `components/`.
- **Use server components by default** in the web app; client only for forms/interactivity.
- **Monochrome white theme** for the web UI (no color gradients).
- **All cloud trace sample data uses the same `CachecatchReport` type** — no
  parallel mock schemas. Local IDE agent samples use `LocalAgentReport`.
- **No persistent web storage** — the landing/API flow must not add auth,
  database, billing, or server-side report persistence.
- **Landing favicon** is the single `app/icon.svg` Micro 5-style `CC` mark.
  Do not add duplicate favicon files under `public/`.

## CLI vs web app

- **CLI** (`src/bin/cachecatch.ts`) is the primary surface for technical
  users. Beautiful terminal output, shareable HTML export, CI-friendly
  JSON output.
- **Web app** (`app/`, `components/`) is the marketing surface + a quick
  no-install way to try Cachecatch. It re-exports the same engine.

## Commands (CLI)

```bash
npx cachecatch                                  # show quick-start
npx cachecatch sample                           # demo report, no API key
npx cachecatch audit local --window 7d          # local Claude Code/Codex/OpenCode audit
npx cachecatch audit <project> --provider langsmith --window 7d
npx cachecatch projects --provider langfuse     # list available projects
npx cachecatch export report.json --format html --out ./report.html
npx --yes cachecatch share --handle @yourname    # generate X card PNG from latest report (--yes skips the rare re-install prompt)
npx cachecatch config set-key langsmith <key>   # persist API key to .env
```

## Commands (npm)

```bash
npm run dev               # Next.js dev server (web app)
npm run build:cli         # Compile the CLI to dist/index.js
npm run build             # Build CLI and web app
npm run typecheck         # tsc --noEmit (strict)
npm run lint              # ESLint
npm test                  # Run all unit tests
npm run test:live         # Run live API smoke tests (requires real keys)
npm run cachecatch        # Run the CLI via tsx (no build step)
```

## Testing

- **Engine** (`src/engine/__tests__/`) — pure cloud trace unit tests, no provider I/O.
- **Local agent audit** (`src/engine/local-agent-audit.ts`) — scans local
  Claude Code, Codex, and OpenCode session artifacts. Keep redaction enabled
  by default and avoid logging transcript content.
- **Adapters** (`src/adapters/__tests__/adapters.test.ts`) — normalizer unit
  tests, end-to-end mock pipeline.
- **HTTP plumbing** (`src/adapters/__tests__/http-plumbing.test.ts`) —
  asserts the right URL, method, and auth header per provider, using a
  mocked `fetch`.
- **Live** (`src/adapters/__tests__/live.test.ts`) — actually hits
  LangSmith / Langfuse / Braintrust if env keys are set. Skipped otherwise.

## Privacy

- API keys are read from env vars or `.env` (gitignored). They are never
  written to disk outside `.env` and never logged.
- The web app does the audit server-side; the browser only sees the
  returned `CachecatchReport`.
- The CLI keeps everything in memory; nothing is persisted unless the
  user explicitly exports HTML/JSON or the CLI auto-saves a local JSON report
  under `reports/` after an audit.

## Uninstall / re-test from 0

To fully wipe Cachecatch and re-test a freshly published version:

```bash
# 1. Project-local artifacts
rm -rf ./reports ./.env ./cachecatch-x-share*.png

# 2. HOME artifacts (only present if init/daemon were used)
rm -rf ~/.cachecatch

# 3. npx's cached copy of the package (forces re-fetch on next npx call)
npx clear-npx-cache
# or: rm -rf ~/.npm/_npx

# 4. Re-fetch and verify
npx --yes cachecatch@latest --version
```

Step 3 is the one most people miss — without it, `npx cachecatch@latest`
keeps reusing the previously cached copy and you never actually test the
newly published version.

## Publishing (CI)

Two GitHub Actions workflows are checked in under `.github/workflows/`:

- **`ci.yml`** — runs on every push to `main` and on every PR. Runs
  typecheck, lint, tests, build:cli, build:web across Node 18 / 20 / 22.
- **`publish.yml`** — runs on every `v*` tag push. Builds the CLI, runs
  the test suite, then publishes to npm with provenance
  (`--provenance --access public`).

**To publish a new version:**

```bash
# 1. Bump the version in package.json
npm version patch   # or minor / major
# 2. Push the commit + tag
git push origin main --follow-tags
```

The publish step uses `secrets.NPM_TOKEN` (classic automation token) and
OIDC provenance via `id-token: write`. The npm package must be claimed by
the maintainer on npmjs.com the first time, otherwise the publish will
fail with a 403.

**One-time repo setup (GitHub):**

1. Add `NPM_TOKEN` to repo Settings → Secrets and variables → Actions.
2. Make sure the workflow has `id-token: write` permission (already set).
3. The first publish needs `npm login` + `npm access` claim from a human
   on the npmjs.com side; subsequent publishes are fully automated.

## Release checklist

1. `npm run typecheck` clean
2. `npm test` clean
3. `npm run build` clean
4. `npm version patch` (or `minor` / `major`)
5. `git push origin main --follow-tags`
6. Watch the **Publish to npm** workflow in GitHub Actions
7. Verify the new version on https://www.npmjs.com/package/cachecatch
8. Smoke test: `npx --yes cachecatch@latest --version`

# Cachecatch — Agent Instructions

## Overview

Cachecatch is a **Prompt CacheOps** tool. It audits LLM-traced runs across
multiple observability providers (LangSmith, Langfuse, Braintrust), detects
prompt-cache breakers, estimates wasted spend, and gives exact fixes.

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
  bin/                # CLI entry point + commands (audit, sample, export, projects, config)
  adapters/           # Provider-specific I/O (langsmith, langfuse, braintrust, mock)
  engine/             # Provider-agnostic analysis (prefix matcher, detectors, scoring, report builder)
  reporting/          # Terminal (chalk + boxen), HTML, and X card renderers
  types/              # Shared interfaces — NormalizedTrace is the canonical shape
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
  engine boundary.
- **`src/adapters/*` is the only place** that knows about provider HTTP APIs.
- **Adding a new provider** is a single new file in `src/adapters/` plus a
  line in `src/adapters/index.ts` to register it. The CLI auto-discovers
  it via `getAdapter(provider)`.
- **UI components must not contain audit logic** — they consume a
  `CachecatchReport` and render it. The web UI lives in `components/`.
- **Use server components by default** in the web app; client only for forms/interactivity.
- **Monochrome white theme** for the web UI (no color gradients).
- **All sample data uses the same `CachecatchReport` type** — no parallel
  mock schemas.

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
npx cachecatch audit <project> --provider langsmith --window 7d
npx cachecatch projects --provider langfuse     # list available projects
npx cachecatch export report.json --format html --out ./report.html
npx cachecatch share --handle @yourname         # generate X card PNG
npx cachecatch config set-key langsmith <key>   # persist API key to .env
```

## Commands (npm)

```bash
npm run dev               # Next.js dev server (web app)
npm run build             # Production build
npm run typecheck         # tsc --noEmit (strict)
npm run lint              # ESLint
npm test                  # Run all unit tests
npm run test:live         # Run live API smoke tests (requires real keys)
npm run cachecatch        # Run the CLI via tsx (no build step)
```

## Testing

- **Engine** (`src/engine/__tests__/`) — pure unit tests, no I/O.
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
  user explicitly exports HTML/JSON.

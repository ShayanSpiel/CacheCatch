# Future Architecture

Cachecatch is built around a **single engine + multiple adapters**
architecture. New surfaces, integrations, and providers plug in
without modifying the core analyzer.

## Current architecture (v0.2.0+)

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  LangSmith API  │    │   Langfuse API  │    │  Braintrust API │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                      │                      │
         ▼                      ▼                      ▼
  ┌──────────────────────────────────────────────────────────┐
  │                  src/adapters/* (I/O)                    │
  │  langsmith.ts    langfuse.ts    braintrust.ts    mock.ts │
  └────────────────────────┬─────────────────────────────────┘
                           │  NormalizedTrace[]
                           ▼
  ┌──────────────────────────────────────────────────────────┐
  │                  src/engine/* (analysis)                 │
  │  prefix-matcher · detectors · scoring · report-builder   │
  └────────────────────────┬─────────────────────────────────┘
                           │  CachecatchReport
                           ▼
  ┌──────────────────────┐         ┌──────────────────────┐
  │   CLI (chalk+boxen)  │         │   Web app (React)    │
  │   src/bin/cachecatch │         │   app/ · components/ │
  └──────────────────────┘         └──────────────────────┘
```

## Phase 1: GitHub Action

```yaml
- uses: anomalyco/cachecatch-action@v1
  with:
    provider: langsmith
    api-key: ${{ secrets.LANGSMITH_API_KEY }}
    project: my-project
    window: 7d
    fail-on-score: 50
```

The action just shells out to the CLI binary. No new code needed in
`src/` — the action wraps the existing CLI.

## Phase 2: More providers

Adding a new provider is **a single new file** in `src/adapters/`:

```typescript
// src/adapters/honeycomb.ts
export const honeycombAdapter: ProviderAdapter = {
  id: "honeycomb",
  displayName: "Honeycomb",
  async resolveProject(ref) { ... },
  async fetchTraces(args) { ... }
}
```

…plus one line in `src/adapters/index.ts`. The CLI auto-discovers it.

Candidate providers: **Honeycomb**, **Datadog LLM Observability**,
**Arize Phoenix**, **OpenLLMetry/Tempo**, **Helicone**.

## Phase 3: Persistent reports (optional)

```
CLI / Web app → Cachecatch Engine → Report Repository (Postgres / SQLite)
```

* Add a `ReportRepository` interface in `src/storage/` (alongside the
  existing `src/util/` and `src/types/`)
* Implement a `FilesystemRepository` (writes JSON to `~/.cachecatch/`)
* Implement a `PostgresRepository` (Drizzle / Prisma)
* No change to the engine or report schema

## Phase 4: LangSmith feedback write-back

Write audit findings as LangSmith feedback annotations on the project
or run level.

```typescript
interface FeedbackWriter {
  writeProjectFeedback(projectId: string, report: CachecatchReport): Promise<void>
}
```

Lives in `src/adapters/langsmith.ts`. No change to the engine.

## Phase 5: CI guardrails

```yaml
- run: cachecatch audit prod-agent --provider langsmith --fail-under 70
- run: cachecatch audit prod-agent --provider langsmith --diff main
```

The CLI already supports `--json` for machine-readable output.
Adding `--fail-under` and `--diff` is a small change in
`src/bin/commands/audit.ts`.

## Phase 6: Slack / webhook alerts

```typescript
interface NotificationChannel {
  send(report: CachecatchReport): Promise<void>
}
```

Lives in `src/reporting/notify/`. Scheduled audits post digests to
Slack, Discord, or a custom webhook.

## Phase 7: Team accounts and dashboards

* Auth via NextAuth.js (GitHub OAuth) — **web app only**
* Multi-tenant report storage
* Trend graphs across audits
* Alert thresholds per team

**No changes needed to:**
- `src/engine/*` (core analysis)
- `src/types/*` (canonical `NormalizedTrace` and `CachecatchReport`)
- `src/adapters/*` (provider I/O)
- `src/reporting/*` (terminal + HTML renderers)

## Phase 8: Self-hosted distribution

* Docker image
* One-binary release via `bun build --compile` or `pkg`
* Helm chart for k8s
* `.env` config + secret-management integration

## Design principles (carried forward)

1. **Provider-independent core** — `src/engine/*` has zero provider imports
2. **Stable report schema** — `CachecatchReport` is the contract
   between analysis and presentation
3. **Pluggable adapters** — new providers = one new file
4. **No LLM in analysis** — deterministic, auditable results
5. **CLI-first** — every surface in the web app also has a CLI equivalent
6. **Server components by default** in the web app — easy migration to
   server-side rendering and caching

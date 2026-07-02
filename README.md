# Cachecatch

[![Sample Agentic CacheCatch Report banner](public/cachecatch-x-share.png)](https://cachecatch.spielos.xyz/#heroCta)

**Generate your Agentic CacheCatch Report now:** [cachecatch.spielos.xyz](https://cachecatch.spielos.xyz/#heroCta)

Cachecatch is a local CLI that audits AI traces, finds prompt-cache breakers, estimates recoverable cache spend, and gives route-specific fixes.

Prompt cache leaks matter because stable instructions, tools, examples, and policies can be charged like fresh input whenever request-specific data appears too early in the prompt. That shows up as low cache-read tokens, higher latency, and avoidable model spend.

## Quick Start

Run a realistic sample audit with no API key and no network access:

```bash
npx cachecatch@latest sample
```

Useful sample modes:

```bash
npx cachecatch@latest sample --compact
npx cachecatch@latest sample --full
npx cachecatch@latest sample --explain-math
npx cachecatch@latest sample --out ./cachecatch-report.html
```

Audit local IDE agent sessions from Claude Code, Codex, and OpenCode without an API key:

```bash
npx cachecatch@latest audit local --window 7d
```

## Real Audit

Audit a LangSmith project:

```bash
npx cachecatch@latest audit "your-project-name" --provider langsmith --window 7d
```

Audit local agent sessions on your machine:

```bash
npx cachecatch@latest audit local --window 7d
npx cachecatch@latest audit local --window 30d --json ./local-agent-report.json
npx cachecatch@latest audit local --project /path/to/repo --window 7d
```

You can pass the key directly:

```bash
npx cachecatch@latest audit "your-project-name" --provider langsmith --window 7d --key "$LANGSMITH_API_KEY"
```

Or set it once in your shell:

```bash
export LANGSMITH_API_KEY="lsv2_..."
npx cachecatch@latest audit "your-project-name" --provider langsmith --window 7d
```

If you omit the project in a non-interactive shell, Cachecatch exits with a clear setup message instead of guessing.

## Export

Fastest path from sample to HTML:

```bash
npx cachecatch@latest sample --out ./cachecatch-report.html
```

Convert a saved JSON report to HTML:

```bash
npx cachecatch@latest sample --json > audit.json
npx cachecatch@latest export audit.json --format html --out ./cachecatch-report.html
```

If you run export without a JSON input:

```bash
npx cachecatch export --format html --out ./cachecatch-report.html
```

Cachecatch explains that export needs a saved `CachecatchReport` JSON and shows the command to create one.

## Share on X

Generate a shareable X card PNG from any report:

```bash
npx cachecatch@latest share --handle @yourname
```

This fetches your X profile picture, renders a 1024x732 banner with your audit data, and saves it as `cachecatch-x-share.png`. The card shows cache leak score and recoverable savings for cloud trace reports, or IDE agent session/cache profile metrics for local reports. It includes a CTA and is ready to attach to a post.

Use a saved report:

```bash
npx cachecatch@latest share audit.json --handle @yourname -o ./my-card.png
npx cachecatch@latest share local-agent-report.json --handle @yourname -o ./my-local-card.png
```

Non-interactive mode (CI or scripts):

```bash
npx cachecatch@latest share --handle @yourname --no-color
```

## Requirements

- Node.js 18+
- An observability provider API key for real audits
- Rendered prompts and token usage in traces for high-confidence reports

## Privacy

- Runs locally from your terminal.
- Does not store prompts, traces, or reports unless you explicitly write an output file.
- Reads API keys from flags, environment variables, or a local `.env`.
- Does not log API keys.
- The web app path audits server-side; the browser only receives the generated report.

## Supported Providers

| Provider | Status | Credentials | Notes |
| --- | --- | --- | --- |
| LangSmith | Primary path | `LANGSMITH_API_KEY` | Best-tested live provider. Uses sessions and runs APIs. |
| Langfuse | Adapter + HTTP plumbing covered | `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY` | Use `--key publicKey:secretKey` or set both env vars. Live audit depends on your Langfuse project shape. |
| Braintrust | Adapter + HTTP plumbing covered | `BRAINTRUST_API_KEY` | Uses project list and BTQL span queries. Live audit depends on available LLM spans. |

List provider projects:

```bash
npx cachecatch@latest projects --provider langsmith
```

## CLI Commands

| Command | Purpose |
| --- | --- |
| `cachecatch` | Show quick start. |
| `cachecatch sample` | Render a deterministic sample report. |
| `cachecatch sample --compact` | Render a short executive summary. |
| `cachecatch sample --full` | Render all route diagnostics. |
| `cachecatch sample --json` | Print a raw `CachecatchReport` JSON. |
| `cachecatch sample --out ./report.html` | Export the sample as HTML. |
| `cachecatch audit "project" --provider langsmith --window 7d` | Run a live audit. |
| `cachecatch audit local --window 7d` | Scan local Claude Code, Codex, and OpenCode sessions. |
| `cachecatch audit local --project /path/to/repo --window 7d` | Restrict local session analysis to one repository path. |
| `cachecatch audit "project" --json` | Print live audit JSON for automation/export. |
| `cachecatch projects --provider langsmith` | List projects visible to a provider key. |
| `cachecatch config set-key langsmith <key>` | Save a provider key to local `.env`. |
| `cachecatch config set-key langfuse publicKey:secretKey` | Save Langfuse public and secret keys. |
| `cachecatch config get` | Show redacted local config. |
| `cachecatch export audit.json --format html --out ./report.html` | Convert saved report JSON to HTML. |
| `cachecatch share --handle @yourname` | Generate a shareable X card PNG. |
| `cachecatch --help` | Show CLI help. |

All report commands support `--no-color` for plain terminal output.

## Troubleshooting

### Vercel deploy returns 404

Cachecatch uses the Next.js App Router and should deploy as a normal Next app. The app config intentionally avoids forced trailing slashes because Vercel project and domain routing can serve `/` and `/report/sample` differently when `trailingSlash` is enabled. If a deployment returns 404, confirm Vercel is building with `npm run build`, the framework preset is Next.js, and the deployed output includes the App Router routes.

### Missing project

Pass the project name or ID:

```bash
npx cachecatch@latest audit "your-project-name" --provider langsmith --window 7d
```

Use `projects` if you are unsure which names your key can see.

### Missing API key

Set the provider key or pass `--key`:

```bash
export LANGSMITH_API_KEY="lsv2_..."
```

Langfuse requires both public and secret keys:

```bash
export LANGFUSE_PUBLIC_KEY="pk-lf-..."
export LANGFUSE_SECRET_KEY="sk-lf-..."
```

### No trace data found

Try a wider window:

```bash
npx cachecatch@latest audit "your-project-name" --provider langsmith --window 30d
```

Also confirm that your traces include rendered prompts and LLM token usage.

### Export says no report JSON was provided

`export` converts a saved JSON report. Create one first:

```bash
npx cachecatch@latest sample --json > audit.json
npx cachecatch@latest export audit.json --format html --out ./cachecatch-report.html
```

### JSON output is needed for CI

Use `--json` and redirect stdout:

```bash
npx cachecatch@latest sample --json > audit.json
```

No spinner or status text is printed in JSON mode.

## Development

```bash
npm install
npm run build
npm run lint
npm test
npm run test:live
npm run cachecatch -- sample
```

Development scripts:

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js web app. |
| `npm run build:cli` | Compile the CLI to `dist/index.js`. |
| `npm run build` | Build CLI and web app. |
| `npm run typecheck` | Run TypeScript checks. |
| `npm run lint` | Run ESLint. |
| `npm test` | Run engine, adapter, HTTP plumbing, and CLI tests. |
| `npm run test:live` | Run live provider smoke tests when real keys are set. |
| `npm run cachecatch -- sample` | Run the local CLI. |

## Architecture

```text
src/
  bin/        CLI entry point and commands
  adapters/   LangSmith, Langfuse, Braintrust, and mock provider I/O
  engine/     Provider-agnostic trace analysis plus local IDE session audit
  reporting/  Terminal, HTML, and X card renderers
  types/      Shared CachecatchReport and NormalizedTrace types
  util/       HTTP and environment helpers
```

The CLI and web app share the same engine and `CachecatchReport` schema. Provider-specific HTTP code stays in `src/adapters/*`; cache analysis stays provider-agnostic in `src/engine/*`. Local IDE agent scanning is implemented in `src/engine/local-agent-audit.ts` and produces a `LocalAgentReport`. The X card banners are generated from `src/reporting/x-card.ts` or `src/reporting/x-card-local.ts` (HTML templates) and `src/reporting/html-to-png.ts` (Puppeteer screenshot).

## License

MIT

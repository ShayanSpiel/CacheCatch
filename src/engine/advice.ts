import type {
  CacheFinding,
  FixAdvice,
  ReportMode,
  RouteAudit,
  RoutePromptRebuild,
} from "../types/index.ts"
import type { ModelPrice } from "./pricing.ts"

export type { FixAdvice } from "../types/index.ts"

interface AdviceForRouteArgs {
  route: RouteAudit
  rebuild: RoutePromptRebuild
  findings: CacheFinding[]
  modelPrice?: ModelPrice
  reportMode: ReportMode
  financialMode: boolean
}

/** Pretty-format a USD number. */
function usd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "n/a"
  if (Math.abs(n) >= 1000) return `$${Math.round(n).toLocaleString("en-US")}`
  if (Math.abs(n) >= 1) return `$${n.toFixed(2)}`
  return `$${n.toFixed(3)}`
}

/** Pretty-format a percentage. */
function pct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "n/a"
  return `${Math.round(n * 100)}%`
}

/** Choose the highest-severity finding to anchor the title + oneLiner. */
function topFinding(findings: CacheFinding[]): CacheFinding | undefined {
  if (findings.length === 0) return undefined
  return [...findings].sort((a, b) => severityRank(a) - severityRank(b))[0]
}

function severityRank(f: CacheFinding): number {
  if (f.severity === "critical") return 0
  if (f.severity === "high") return 1
  if (f.severity === "medium") return 2
  return 3
}

function charRef(n: number | undefined): string {
  if (n === undefined) return "early in prompt"
  return `char ${n.toLocaleString("en-US")}`
}

function dynamicFieldClause(rebuild: RoutePromptRebuild): string {
  const first = rebuild.fieldsToMoveDown[0]
  if (!first) return "the first volatile token in the prefix"
  return `\`${first.firstSeen}\` at ${charRef(first.currentChar)}`
}

function dynamicFieldListClause(rebuild: RoutePromptRebuild): string {
  if (rebuild.fieldsToMoveDown.length === 0) return "the dynamic request fields"
  if (rebuild.fieldsToMoveDown.length === 1) return `\`${rebuild.fieldsToMoveDown[0].firstSeen}\``
  const shown = rebuild.fieldsToMoveDown
    .slice(0, 3)
    .map((f) => `\`${f.firstSeen.length > 28 ? `${f.firstSeen.slice(0, 25)}…` : f.firstSeen}\``)
    .join(", ")
  const extra = rebuild.fieldsToMoveDown.length > 3 ? ` and ${rebuild.fieldsToMoveDown.length - 3} more` : ""
  return `${shown}${extra}`
}

function cacheRuleClause(modelPrice: ModelPrice | undefined): string {
  if (!modelPrice?.cacheContract) {
    return "Prompt caching is prefix-sensitive; one volatile byte near the top can make the downstream prompt unique."
  }
  const c = modelPrice.cacheContract
  const parts: string[] = []
  parts.push(
    c.stable === "byte"
      ? `On \`${modelPrice.family}\`, the cache key is byte-stable on the system block`
      : `On \`${modelPrice.family}\`, the cache key is scoped by \`${c.keyField ?? "prefix"}\``
  )
  parts.push(`minimum cached prefix is ~${c.minPrefixTokens.toLocaleString("en-US")} tokens`)
  parts.push(`cached input is ${Math.round(c.discountCachedVsInput * 100)}% off the uncached price`)
  return parts.join("; ") + "."
}

function titleFor(findings: CacheFinding[], route: RouteAudit): string {
  const top = topFinding(findings)
  if (!top) return `${route.route}: stable prefix, no evidence-backed fix needed`
  return `${route.route}: ${top.title.toLowerCase()} breaking cache at ${charRef(top.firstDivergenceChar ?? route.avgFirstDivergenceChar)}`
}

function oneLinerFor(args: AdviceForRouteArgs): string {
  const { route, rebuild, modelPrice, financialMode } = args
  const top = topFinding(args.findings)
  const rate = pct(route.observedCacheReadRate)
  const expected = pct(rebuild.expectedCacheReadRateAfterFix)
  const savings = usd(rebuild.expectedMonthlySavingsUsd)
  const head = top
    ? `First divergence is ${dynamicFieldClause(rebuild)}`
    : `Prefix is stable`
  if (financialMode && modelPrice) {
    return `${head}. Cache-read is ${rate} → expected ${expected} after the rebuild. Recoverable on \`${modelPrice.family}\`: ${savings}/mo.`
  }
  if (financialMode) {
    return `${head}. Cache-read is ${rate} → expected ${expected} after the rebuild. Pricing not matched, so the dollar number is hidden.`
  }
  return `${head}. Cache-read is ${rate} → expected ${expected} after the rebuild. Enable token + cached-token telemetry to compute finance-grade savings.`
}

function whatToChangeFor(args: AdviceForRouteArgs): string[] {
  const { route, rebuild, findings, modelPrice, financialMode } = args
  const top = topFinding(findings)
  const out: string[] = []

  if (rebuild.fieldsToMoveDown.length > 0) {
    const fields = dynamicFieldListClause(rebuild)
    out.push(
      `Move ${fields} out of the stable prefix in \`${route.route}\` and into the dynamic tail (after \`## Tool Definitions\` and before \`## User Message\`).`
    )
  }
  for (const sort of rebuild.fieldsToSort) {
    if (sort.kind === "tool_schema") {
      out.push(
        "Freeze, sort, and version the tool-schema block. Pin the schema hash to a deployment tag so tool drift can't quietly invalidate the cache."
      )
    } else {
      out.push(sort.reason)
    }
  }
  if (top?.type === "rag_before_stable_context") {
    out.push(
      "Render retrieval results strictly after the stable prefix. If you must cite a doc id in the system block, place it in the dynamic tail as a citation, not as a key."
    )
  }
  if (modelPrice?.cacheContract) {
    out.push(cacheRuleClause(modelPrice))
  }
  if (!financialMode) {
    out.push(
      "Enable cached-token telemetry in your provider so the next audit can quote a finance-grade savings number instead of this directional estimate."
    )
  }
  if (out.length === 0) {
    out.push(`No evidence-backed fix for \`${route.route}\`; rerun the audit after the next deploy to confirm.`)
  }
  return out.slice(0, 5)
}

function whyItHurtsFor(args: AdviceForRouteArgs): FixAdvice["whyItHurts"] {
  const { rebuild } = args
  const rate = args.route.observedCacheReadRate
  const human =
    rate !== null && rate < 0.1
      ? `You're paying full input price for repeated context — the prefix breaks on ${dynamicFieldClause(rebuild)}, so almost nothing caches.`
      : `A single volatile field (${dynamicFieldClause(rebuild)}) is invalidating the cache hit, so the repeated context bill is higher than it should be.`
  const technical = rebuild.cacheContractNote
    ? `${rebuild.cacheContractNote} Moving the dynamic field below the stable prefix lets the provider reuse the byte-stable block.`
    : `Prompt caching is prefix-sensitive. The stable block must render byte-identical for the provider to reuse it; one dynamic byte (${dynamicFieldClause(rebuild)}) forces a fresh prefill.`
  return { human, technical }
}

function agentInstructionFor(args: AdviceForRouteArgs): string {
  const { route, rebuild, findings, modelPrice, financialMode } = args
  const top = topFinding(findings)
  const fieldList = rebuild.fieldsToMoveDown
    .slice(0, 4)
    .map((f) => f.firstSeen.length > 40 ? `${f.firstSeen.slice(0, 37)}…` : f.firstSeen)
    .join(", ") || "the dynamic request fields"

  const lines: string[] = [
    `Refactor the \`${route.route}\` prompt builder into a stable_prefix and a dynamic_tail.`,
    `stable_prefix (render first, byte-stable across comparable requests):`,
    ...rebuild.stableHeader.map((h) => `  - ${h}`),
    `dynamic_tail (render after, request-specific):`,
    `  - ${fieldList}`,
    `  - user / session / request metadata`,
    `  - retrieved chunks and search results`,
    `  - tool outputs and runtime availability flags`,
    `  - the user message`,
  ]
  if (modelPrice?.cacheContract) {
    lines.push(
      `Provider cache contract for \`${modelPrice.family}\`: ${modelPrice.cacheContract.rule}`
    )
  }
  if (top) {
    lines.push(
      `Primary fix: move \`${top.title}\` (currently at ${charRef(top.firstDivergenceChar ?? route.avgFirstDivergenceChar)}) below the stable prefix.`
    )
  }
  if (!financialMode) {
    lines.push(
      "Telemetry: enable cached-token and token-usage fields in the provider so the next audit can produce a finance-grade number."
    )
  }
  lines.push(
    financialMode
      ? "Validation: rerun cachecatch after deploy; first divergence should move after the stable prefix, cache-read should improve, and the projected savings should fall."
      : "Validation: rerun cachecatch after deploy; first divergence should move later, prefix stability should improve, and telemetry should be present in the next audit."
  )
  return lines.join("\n")
}

function validationFor(args: AdviceForRouteArgs): FixAdvice["validation"] {
  const { route, rebuild, financialMode } = args
  const project = "${CACHECATCH_PROJECT}"
  return {
    command: `npx --yes cachecatch@latest audit "${project}" --provider ${args.route.provider ?? "<provider>"} --window 24h`,
    successCriteria: financialMode
      ? [
          `first divergence moves after char ${rebuild.fieldsToMoveDown[0]?.currentChar ?? route.avgFirstDivergenceChar} (currently the breaker position)`,
          `cache-read rate moves toward ${pct(rebuild.expectedCacheReadRateAfterFix)}`,
          `projected monthly recoverable cache loss drops by at least 50%`,
        ]
      : [
          "token usage and cached-token telemetry are present in the next audit",
          `first divergence moves after char ${rebuild.fieldsToMoveDown[0]?.currentChar ?? route.avgFirstDivergenceChar}`,
          "prefix stability improves across comparable traces",
        ],
  }
}

export function adviceForRoute(args: AdviceForRouteArgs): FixAdvice {
  return {
    title: titleFor(args.findings, args.route),
    oneLiner: oneLinerFor(args),
    whatToChange: whatToChangeFor(args),
    whyItHurts: whyItHurtsFor(args),
    agentInstruction: agentInstructionFor(args),
    validation: validationFor(args),
  }
}

interface AdviceForLocalProjectArgs {
  projectPath: string
  agentsMdStatus: "missing" | "weak" | "present" | "unknown"
  claudeMdStatus: "missing" | "weak" | "present" | "unknown"
  cacheReadPercent: number | null
  sessions: number
  agentName?: "claude-code" | "codex" | "opencode"
}

/**
 * Local IDE-agent advice generator. The contract is narrower than
 * `adviceForRoute` (no per-route prompt text, no pricing) so the
 * shape is intentionally simpler.
 */
export function adviceForLocalProject(args: AdviceForLocalProjectArgs): FixAdvice {
  const { projectPath, agentsMdStatus, claudeMdStatus, cacheReadPercent, sessions, agentName } = args
  const projectName = projectPath.split("/").filter(Boolean).pop() ?? projectPath
  const title =
    agentsMdStatus === "missing"
      ? `${projectName}: add AGENTS.md to give sessions a stable prefix`
      : agentsMdStatus === "weak"
        ? `${projectName}: expand AGENTS.md — it's too thin to be a stable prefix`
        : cacheReadPercent !== null && cacheReadPercent < 0.35
          ? `${projectName}: stable files are present but the cache is leaking anyway`
          : `${projectName}: keep the instruction files byte-stable`

  const oneLiner =
    agentsMdStatus === "missing"
      ? `${sessions.toLocaleString("en-US")} sessions in this project started from a clean room; they re-built the same project context every run.`
      : agentsMdStatus === "weak"
        ? `AGENTS.md exists but is too short to anchor a stable prefix; the agent rebuilds the rest from scratch.`
        : cacheReadPercent !== null && cacheReadPercent < 0.35
          ? `AGENTS.md is present and looks stable, but observed cache-read is only ${Math.round(cacheReadPercent * 100)}% — the leakage is below the instruction files, in task context.`
          : `Keep AGENTS.md byte-stable across sessions.`

  const whatToChange: string[] = []
  if (agentsMdStatus === "missing") {
    whatToChange.push(
      `Create AGENTS.md in \`${projectPath}\` with: project rules, layout boundaries, command policy, privacy rules, and testing expectations.`
    )
  } else if (agentsMdStatus === "weak") {
    whatToChange.push(
      `Expand AGENTS.md in \`${projectPath}\` with stable commands, architecture boundaries, and testing expectations. Aim for ≥ 400 tokens of byte-stable text.`
    )
  } else {
    whatToChange.push(
      `Keep AGENTS.md in \`${projectPath}\` byte-stable. Do not append timestamps, sprint notes, or per-task state.`
    )
  }
  if (claudeMdStatus === "missing" && (agentName === "claude-code" || !agentName)) {
    whatToChange.push(
      `If Claude Code is used here, add CLAUDE.md or have it delegate to AGENTS.md so Claude sessions inherit the same stable repo rules.`
    )
  } else if (claudeMdStatus === "weak" && (agentName === "claude-code" || !agentName)) {
    whatToChange.push(`Expand CLAUDE.md or have it delegate to AGENTS.md in \`${projectPath}\`.`)
  }
  if (cacheReadPercent !== null && cacheReadPercent < 0.35) {
    whatToChange.push(
      `Move logs, diffs, terminal output, and task-specific notes below stable repo rules. The cache leak is below AGENTS.md.`
    )
  }
  whatToChange.push(
    `When continuing old work, summarize the previous session instead of replaying full transcripts.`
  )

  return {
    title,
    oneLiner,
    whatToChange,
    whyItHurts: {
      human: `Without a stable instruction file, every session re-pays the cost of rediscovering the project.`,
      technical: `Local agents re-read the transcript each turn; without a byte-stable AGENTS.md prefix, the agent re-derives the same context on every call.`,
    },
    agentInstruction: [
      `You are working in \`${projectPath}\`.`,
      `Move stable project context, commands, privacy rules, and testing expectations into AGENTS.md.`,
      `Keep that stable block byte-stable across sessions.`,
      `Put dynamic material only after the stable context: terminal output, logs, stack traces, git diffs, timestamps, current branch state, and one-off task notes.`,
      `When continuing old work, summarize the previous session first instead of replaying full transcripts.`,
    ].join("\n"),
    validation: {
      command: `npx --yes cachecatch@latest audit local --window 7d`,
      successCriteria: [
        `${projectName} project status moves to "present" for AGENTS.md`,
        "subsequent audits show fewer `weak-agents-md` and `repeated-project-context` findings for this project",
        cacheReadPercent !== null
          ? "observed cache-read is reported for this project on the next audit"
          : "cache-read telemetry is reported for this project on the next audit",
      ],
    },
    sourceLocation: projectPath,
  }
}

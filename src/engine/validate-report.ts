import type { CachecatchReport, CacheFinding, RoutePromptRebuild } from "../types/index.ts"

/**
 * Validate a freshly-built `CachecatchReport` and return a list of
 * human-readable warnings. The caller (`buildReport`) downgrades
 * `report.confidence` to `medium` on any warning and merges the
 * warnings into `report.dataQuality.warnings`.
 *
 * This mirrors the local-report pattern in
 * `src/engine/local-agent-audit.ts:validateLocalAgentReport`.
 */
export function validateReport(report: CachecatchReport): string[] {
  const warnings: string[] = []

  // (1) Every route's estimated loss must sum to the global, modulo
  //     the existing rounding-delta rule (see report-builder.ts).
  if (report.routes.length > 0) {
    const routeSum = report.routes.reduce((sum, r) => sum + r.estimatedMonthlyWasteUsd, 0)
    if (Math.abs(routeSum - report.summary.estimatedMonthlyWasteUsd) > 1) {
      warnings.push(
        `Per-route estimatedMonthlyWasteUsd (${routeSum}) does not equal summary.estimatedMonthlyWasteUsd (${report.summary.estimatedMonthlyWasteUsd}).`
      )
    }
  }

  // (2) Rebuilds must parallel routes.
  if (report.rebuilds && report.rebuilds.length !== report.routes.length) {
    warnings.push(
      `report.rebuilds length (${report.rebuilds.length}) does not match report.routes length (${report.routes.length}).`
    )
  }

  // (3) Per-rebuild integrity.
  for (const rebuild of report.rebuilds ?? []) {
    validateRebuild(rebuild, warnings)
  }

  // (4) Advice must parallel routes.
  if (report.advice && report.advice.length !== report.routes.length) {
    warnings.push(
      `report.advice length (${report.advice.length}) does not match report.routes length (${report.routes.length}).`
    )
  }

  // (5) Findings: observed-basis must carry a divergence position; evidence must be non-trivial.
  for (const finding of report.findings) {
    validateFinding(finding, warnings)
  }

  // (6) Financial-mode consistency: if mode === financial_cache_audit, we must have a recoverable delta.
  if (report.details?.reportMode === "financial_cache_audit") {
    if (report.details.recoverableDeltaPerMillion === undefined) {
      warnings.push("reportMode is financial_cache_audit but details.recoverableDeltaPerMillion is undefined.")
    }
    if (report.summary.estimatedMonthlyWasteUsd <= 0) {
      warnings.push("reportMode is financial_cache_audit but summary.estimatedMonthlyWasteUsd is zero.")
    }
  }

  // (7) Money math consistency: formula (when present) must compute the precise number.
  const formula = report.details?.monthlyRecoverableCacheLossFormula
  const precise = report.details?.monthlyRecoverableCacheLossPrecise
  if (formula && precise !== undefined) {
    const m = formula.match(/=\s*\$?([0-9.]+)/)
    if (m) {
      const fromFormula = Number(m[1])
      if (Number.isFinite(fromFormula) && Math.abs(fromFormula - precise) > 0.01) {
        warnings.push(
          `monthlyRecoverableCacheLossFormula evaluates to $${fromFormula.toFixed(2)} but precise is $${precise.toFixed(2)}.`
        )
      }
    }
  }

  return warnings
}

function validateRebuild(rebuild: RoutePromptRebuild, warnings: string[]): void {
  if (rebuild.expectedCacheReadRateAfterFix < 0 || rebuild.expectedCacheReadRateAfterFix > 1) {
    warnings.push(
      `Rebuild for ${rebuild.route}: expectedCacheReadRateAfterFix=${rebuild.expectedCacheReadRateAfterFix} is outside [0, 1].`
    )
  }
  if (rebuild.reusableTokensAfterFix < 0) {
    warnings.push(`Rebuild for ${rebuild.route}: reusableTokensAfterFix is negative.`)
  }
  if (rebuild.stableHeader.length === 0) {
    warnings.push(`Rebuild for ${rebuild.route}: stableHeader is empty.`)
  }
}

function validateFinding(finding: CacheFinding, warnings: string[]): void {
  if (!finding.evidence || finding.evidence.trim().length < 8) {
    warnings.push(`Finding ${finding.id} has insufficient evidence (${finding.evidence?.length ?? 0} chars).`)
  }
  if (finding.basis === "observed") {
    if (finding.firstDivergenceToken === undefined || finding.firstDivergenceChar === undefined) {
      warnings.push(
        `Finding ${finding.id} has basis=observed but no firstDivergenceToken/Char.`
      )
    }
  }
}

import { approximateTokens } from "./tokens.ts"

export { approximateTokens } from "./tokens.ts"

export interface PrefixStats {
  commonPrefixLength: number
  commonPrefixTokens: number
  totalLength: number
  totalTokens: number
  firstDivergenceToken: number
  firstDivergenceChar: number
  firstDivergenceTokenApproximate: boolean
  prefixRatio: number
}

function findCommonPrefix(a: string, b: string): string {
  let i = 0
  const max = Math.min(a.length, b.length)
  while (i < max && a[i] === b[i]) i++
  return a.slice(0, i)
}

/**
 * Compute the longest common prefix of a batch of prompt strings,
 * and surface the first-divergence token index.
 *
 * If the batch is too small (<2) we return null and the caller can
 * fall back to heuristic defaults.
 */
export function comparePrompts(prompts: string[]): PrefixStats | null {
  const valid = prompts.filter((p) => p && p.length > 0)
  if (valid.length < 2) return null

  let commonPrefix = valid[0]
  for (let i = 1; i < Math.min(valid.length, 100); i++) {
    commonPrefix = findCommonPrefix(commonPrefix, valid[i])
    if (commonPrefix.length === 0) break
  }

  const commonPrefixLength = commonPrefix.length
  const commonPrefixTokens = approximateTokens(commonPrefixLength)

  const avgTotalLength =
    valid.reduce((sum, p) => sum + p.length, 0) / valid.length
  const avgTotalTokens = approximateTokens(avgTotalLength)

  const firstDivergenceToken = Math.max(1, commonPrefixTokens + 1)
  const prefixRatio = avgTotalTokens > 0 ? commonPrefixTokens / avgTotalTokens : 0

  return {
    commonPrefixLength,
    commonPrefixTokens,
    totalLength: Math.round(avgTotalLength),
    totalTokens: avgTotalTokens,
    firstDivergenceToken,
    firstDivergenceChar: commonPrefixLength,
    firstDivergenceTokenApproximate: true,
    prefixRatio,
  }
}

/**
 * Token / character heuristic utilities used across the engine.
 * Kept here so the engine has no dependency on any provider.
 */

export function approximateTokens(input: string | number): number {
  if (typeof input === "number") return Math.max(1, Math.round(input))
  if (!input) return 0
  return Math.ceil(input.length / 4)
}

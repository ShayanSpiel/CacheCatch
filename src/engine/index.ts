/**
 * Public surface of the engine.
 *
 * Everything in `src/engine/*` is provider-agnostic and operates
 * exclusively on `NormalizedTrace[]` and `CachecatchReport` shapes.
 */

export * from "./constants.ts"
export * from "./tokens.ts"
export * from "./prefix-matcher.ts"
export * from "./detectors.ts"
export * from "./scoring.ts"
export * from "./report-builder.ts"
export * from "./local-agent-audit.ts"

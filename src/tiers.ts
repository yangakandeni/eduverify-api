export type Tier = "internal" | "free" | "developer" | "business";

export interface TierConfig {
  tier: Tier;
  /** Whether this tier can call /v1/qualifications/verify/batch at all. */
  allowBatch: boolean;
  maxBatchSize: number;
  /** Whether this tier can request qualifications outside HEQSF. Reserved for a future tier
   * restriction; every tier currently allows every framework, since restricting NQF
   * sub-framework batch access is per the plan. */
  allowAllFrameworks: boolean;
}

/** API Gateway usage plans handle request-rate/quota enforcement natively (per Part 2's infra
 * decision) — this config is for the feature-gating a usage plan can't express, e.g. "Free tier
 * gets no /batch access at all," not "Free tier gets N requests/day" (that's AWS's job). */
const TIER_CONFIGS: Record<Tier, TierConfig> = {
  internal: { tier: "internal", allowBatch: true, maxBatchSize: 100, allowAllFrameworks: true },
  free: { tier: "free", allowBatch: false, maxBatchSize: 1, allowAllFrameworks: true },
  developer: { tier: "developer", allowBatch: true, maxBatchSize: 10, allowAllFrameworks: true },
  business: { tier: "business", allowBatch: true, maxBatchSize: 50, allowAllFrameworks: true },
};

export function getTierConfig(tier: Tier): TierConfig {
  return TIER_CONFIGS[tier];
}

/** Resolves an API Gateway request's API key to its tier config. `keyTiers` is passed in
 * rather than read from a module-level map: v1 has no self-serve signup (per the plan's
 * confirmed decision — keys are issued manually), so the actual key->tier mapping is expected
 * to live in a small deploy-time config or lookup table, not committed here as a hardcoded
 * secret. An unrecognized or missing key resolves to the free tier — the safest default. */
export function resolveTier(apiKey: string | undefined, keyTiers: Record<string, Tier>): TierConfig {
  if (!apiKey) return getTierConfig("free");
  const tier = keyTiers[apiKey];
  return getTierConfig(tier ?? "free");
}

import type { Tier } from "./tiers";

/** v1 has no self-serve signup (per the plan's confirmed decision) — API keys are issued by
 * hand, and their tier assignment is supplied at deploy time via EDUVERIFY_API_KEY_TIERS
 * (a JSON object of apiKey -> tier) rather than committed to source. Empty/missing/malformed
 * env resolves to no known keys, which just means every request falls back to the free tier —
 * the safe default, not an error. */
function parseFromEnv(): Record<string, Tier> {
  const raw = process.env.EDUVERIFY_API_KEY_TIERS;
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, Tier>;
  } catch {
    return {};
  }
}

export const KEY_TIERS: Record<string, Tier> = parseFromEnv();

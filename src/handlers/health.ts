import { checkTableReachable } from "../lib/dynamodb";

export interface HealthResult {
  status: "ok" | "degraded";
  dynamodb: boolean;
}

/** GET /v1/health — unauthenticated uptime check. "degraded" (not a 5xx-only concern) since
 * the API process itself can be up while its one dependency, the table, isn't reachable. */
export async function checkHealth(): Promise<HealthResult> {
  const dynamodb = await checkTableReachable();
  return { status: dynamodb ? "ok" : "degraded", dynamodb };
}

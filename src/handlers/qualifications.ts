import { verifyQualification } from "../matching/verifyQualification";
import type { VerifyQualificationRequest, VerifyQualificationResult } from "../matching/verifyQualification";

/** POST /v1/qualifications/verify — thin pass-through to the matcher; the handler layer's
 * job here is just being the stable HTTP-facing name for it. */
export async function verifyQualificationHandler(
  request: VerifyQualificationRequest,
): Promise<VerifyQualificationResult> {
  return verifyQualification(request);
}

/** POST /v1/qualifications/verify/batch — a single form submission commonly claims several
 * qualifications from the same institution, so this just fans out to the single-item matcher per
 * claim rather than doing anything institution-lookup-sharing-clever; `maxBatchSize` is enforced
 * here (the caller passes the tier's limit — see tiers.ts) rather than left to the caller to
 * remember. */
export async function verifyQualificationBatch(
  items: VerifyQualificationRequest[],
  maxBatchSize = 50,
): Promise<VerifyQualificationResult[]> {
  if (items.length === 0) return [];
  if (items.length > maxBatchSize) {
    throw new Error(`Batch size ${items.length} exceeds the maximum of ${maxBatchSize} for this tier`);
  }

  return Promise.all(items.map((item) => verifyQualification(item)));
}

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { normalizeProvince } from "./normalize";
import type { FacultyProgrammes, InstitutionRecord } from "./types";

const TABLE_NAME = process.env.EDUVERIFY_TABLE_NAME ?? "eduverify-institutions";
const REGION = process.env.AWS_REGION ?? "af-south-1";
const REQUEST_TIMEOUT_MS = 2500;

/** Set by local dev tooling only (scripts/dev-server.ts, scripts/seed-local-dynamodb.ts) to
 * point at DynamoDB Local instead of real AWS — never set in a deployed environment. DynamoDB
 * Local doesn't validate credentials, but the SDK still requires some value to be present, so
 * a fixed dummy pair goes along with the endpoint override rather than requiring a developer to
 * set up throwaway AWS credentials just to run this locally. */
const LOCAL_ENDPOINT = process.env.DYNAMODB_ENDPOINT;

/** GSI1PK values written by eduverify's parser/dynamo_item.py (institution.status, uppercased,
 * or UNKNOWN) plus scripts/seed_dynamodb.py's public-university/TVET status strings, uppercased
 * the same way. This repo is a read-only consumer of that same table — see parser/CLAUDE.md in
 * the eduverify repo for who writes it. Exported so handlers (e.g. the search handler's
 * full-corpus fuzzy scan) can enumerate every partition without duplicating this list — miss
 * one here and those institutions become invisible to every GSI1-based query (search, list)
 * even though a direct GetItem by PK still finds them. */
export const STATUS_PARTITIONS = [
  "REGISTERED",
  "PROVISIONALLY REGISTERED",
  "UNKNOWN",
  "ESTABLISHED — HIGHER EDUCATION ACT",
  "ESTABLISHED — CONTINUING EDUCATION AND TRAINING ACT",
  "CANCELLED",
  "DISCONTINUED",
  "BOGUS",
];

let client: DynamoDBDocumentClient | null = null;

function getClient(): DynamoDBDocumentClient {
  if (!client) {
    client = DynamoDBDocumentClient.from(
      new DynamoDBClient({
        region: REGION,
        requestHandler: { requestTimeout: REQUEST_TIMEOUT_MS },
        ...(LOCAL_ENDPOINT
          ? { endpoint: LOCAL_ENDPOINT, credentials: { accessKeyId: "local", secretAccessKey: "local" } }
          : {}),
      })
    );
  }
  return client;
}

/** DynamoDB is seeded from private DHET register data (parser/dynamo_item.py spreads
 * institutions.json's records as-is, which never carry an institutionType field) plus, via
 * eduverify's scripts/seed_dynamodb.py, public universities/TVET colleges (which do carry
 * one) — so items carry faculties_and_programmes directly once eduverify's
 * `npm run bake:faculties` has enriched institutions.json/public_universities.json/
 * public_tvets.json before seeding — no further parsing needed here. Defaults
 * faculties_and_programmes to [] for items ingested via the live S3->Lambda path
 * (parser/lambda_handler.py), which bypasses the bake step and won't have the field yet, and
 * strips a stale raw `qualifications` key if one is still present on such a legacy item.
 * Defaults institutionType to "Private Higher Education Institution" only when the item
 * itself doesn't carry one — true for every private-register item, never true for a seeded
 * public university/TVET college. Normalizes the raw province attribute via
 * normalizeProvince() — the source register data has inconsistent casing, embedded newlines,
 * and OCR typos, and nothing upstream of this table canonicalizes it before writing, so every
 * consumer of this API would otherwise see that noise (or a bare null) directly. */
export function toRecord(item: Record<string, unknown>): InstitutionRecord {
  const record = { ...item };
  const id = record.PK as string;
  const institutionType =
    (record.institutionType as InstitutionRecord["institutionType"] | undefined) ??
    "Private Higher Education Institution";
  const facultiesAndProgrammes = (record.faculties_and_programmes as FacultyProgrammes[] | undefined) ?? [];
  const province = normalizeProvince(record.province as string | null | undefined);
  delete record.PK;
  delete record.GSI1PK;
  delete record.GSI1SK;
  delete record.institutionType;
  delete record.faculties_and_programmes;
  delete record.qualifications;
  return {
    ...(record as Omit<InstitutionRecord, "id" | "faculties_and_programmes" | "institutionType" | "province">),
    id,
    institutionType,
    faculties_and_programmes: facultiesAndProgrammes,
    province,
  };
}

export async function getInstitutionByPK(pk: string): Promise<InstitutionRecord | null> {
  const result = await getClient().send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: pk } }));
  return result.Item ? toRecord(result.Item) : null;
}

export async function getInstitutionByRegistrationNumber(
  registrationNumber: string
): Promise<InstitutionRecord | null> {
  return getInstitutionByPK(`INST#${registrationNumber}`);
}

/** GSI1 name search: queries each known status partition for names beginning with `prefix`. */
export async function queryByNamePrefix(prefix: string): Promise<InstitutionRecord[]> {
  const docClient = getClient();
  const responses = await Promise.all(
    STATUS_PARTITIONS.map((status) =>
      docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: "GSI1",
          KeyConditionExpression: "GSI1PK = :status AND begins_with(GSI1SK, :prefix)",
          ExpressionAttributeValues: { ":status": status, ":prefix": prefix },
        })
      )
    )
  );
  return responses.flatMap((response) => (response.Items ?? []).map(toRecord));
}

/** Fetches every item in a single GSI1 status partition, ordered by name (GSI1SK), following
 * LastEvaluatedKey until exhausted. Used by the /v1/institutions/list endpoint's browse/paging —
 * DynamoDB has no native "list everything, paginated by an arbitrary page number" operation, so
 * the handler fetches a full partition here and paginates in memory. Fine at this data's scale
 * (low thousands of institutions per status); revisit if that stops being true. */
export async function queryAllByStatus(status: string): Promise<InstitutionRecord[]> {
  const docClient = getClient();
  const items: InstitutionRecord[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const response = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :status",
        ExpressionAttributeValues: { ":status": status },
        ExclusiveStartKey: exclusiveStartKey,
      })
    );
    items.push(...(response.Items ?? []).map(toRecord));
    exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return items;
}

/** Cheap connectivity/permissions check for /v1/health — a GetItem for a key that will never
 * exist is the lowest-cost real round trip to the table (no Query/Scan cost, no risk of a large
 * response). A thrown error (network, credentials, table missing) means "not reachable"; the
 * absence of an Item is expected and not itself a failure. */
export async function checkTableReachable(): Promise<boolean> {
  try {
    await getClient().send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: "__health_check__" } }));
    return true;
  } catch {
    return false;
  }
}

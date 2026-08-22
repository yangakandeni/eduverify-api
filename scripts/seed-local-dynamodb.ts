import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
} from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { institutionKey } from "../src/lib/keys";
import type { Contacts, FacultyProgrammes, InstitutionType, RawInstitution } from "../src/lib/types";

/** Seeds DynamoDB Local from the local-only `data/*.json` fixtures (gitignored — see
 * .gitignore's `data/`) so the API can be exercised end-to-end via curl/Postman without a real
 * AWS account. Mirrors the item shape `../src/lib/dynamodb.ts`'s toRecord() expects to read
 * back: `institutions.json` is the DHET private register (already carries
 * faculties_and_programmes, no institutionType — toRecord defaults that on read), while
 * `public_universities.json`/`public_tvets.json` need institutionType and a synthesized
 * `contacts` object (they only carry a bare `website` string) added here, matching what
 * eduverify's own scripts/seed_dynamodb.py does against the real table. */

const DATA_DIR = fileURLToPath(new URL("../data", import.meta.url));
const ENDPOINT = process.env.DYNAMODB_ENDPOINT ?? "http://localhost:8000";
const TABLE_NAME = process.env.EDUVERIFY_TABLE_NAME ?? "eduverify-institutions";
const REGION = process.env.AWS_REGION ?? "af-south-1";
const BATCH_SIZE = 25; // DynamoDB's own BatchWriteItem-per-call limit.

const client = new DynamoDBClient({
  region: REGION,
  endpoint: ENDPOINT,
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});
const docClient = DynamoDBDocumentClient.from(client);

async function loadJson<T>(filename: string): Promise<T> {
  const raw = await readFile(join(DATA_DIR, filename), "utf-8");
  return JSON.parse(raw) as T;
}

async function ensureTable(): Promise<void> {
  try {
    await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    console.log(`Table "${TABLE_NAME}" already exists — reusing it.`);
    return;
  } catch (error) {
    if (!(error instanceof ResourceNotFoundException)) throw error;
  }

  await client.send(
    new CreateTableCommand({
      TableName: TABLE_NAME,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "PK", AttributeType: "S" },
        { AttributeName: "GSI1PK", AttributeType: "S" },
        { AttributeName: "GSI1SK", AttributeType: "S" },
      ],
      KeySchema: [{ AttributeName: "PK", KeyType: "HASH" }],
      GlobalSecondaryIndexes: [
        {
          IndexName: "GSI1",
          KeySchema: [
            { AttributeName: "GSI1PK", KeyType: "HASH" },
            { AttributeName: "GSI1SK", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    }),
  );
  console.log(`Created table "${TABLE_NAME}" with GSI1.`);
}

/** DHET private-register item — GSI1PK is the uppercased raw status (falling back to
 * "UNKNOWN"), matching STATUS_PARTITIONS and parser/dynamo_item.py's real convention. */
function toPrivateRegisterItem(institution: RawInstitution): Record<string, unknown> {
  return {
    PK: institutionKey(institution),
    GSI1PK: (institution.status ?? "UNKNOWN").toUpperCase(),
    GSI1SK: institution.name,
    name: institution.name,
    registration_number: institution.registration_number ?? null,
    status: institution.status ?? null,
    address: institution.address,
    province: institution.province ?? null,
    contacts: institution.contacts,
    faculties_and_programmes: institution.faculties_and_programmes,
    cancellation_reason: institution.cancellation_reason ?? null,
  };
}

interface PublicRegisterEntry {
  name: string;
  abbreviation?: string;
  address: string;
  province?: string;
  website?: string;
  faculties_and_programmes: FacultyProgrammes[];
}

/** Public university/TVET entry — no DHET registration number or contacts block in the source
 * data, just a bare `website`; institutionType and the fixed GSI1PK status string (see
 * STATUS_PARTITIONS) are synthesized the same way eduverify's own seed_dynamodb.py does against
 * the real table. */
function toPublicRegisterItem(
  entry: PublicRegisterEntry,
  institutionType: InstitutionType,
  statusPartition: string,
): Record<string, unknown> {
  const contacts: Contacts = { email: [], phone: [], website: entry.website ?? null };
  return {
    PK: institutionKey({ name: entry.name }),
    GSI1PK: statusPartition,
    GSI1SK: entry.name,
    name: entry.name,
    abbreviation: entry.abbreviation ?? null,
    registration_number: null,
    status: null,
    address: entry.address,
    province: entry.province ?? null,
    contacts,
    faculties_and_programmes: entry.faculties_and_programmes,
    institutionType,
  };
}

async function batchWrite(items: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: { [TABLE_NAME]: chunk.map((item) => ({ PutRequest: { Item: item } })) },
      }),
    );
  }
}

async function main(): Promise<void> {
  await ensureTable();

  const [institutions, universities, tvets] = await Promise.all([
    loadJson<RawInstitution[]>("institutions.json"),
    loadJson<PublicRegisterEntry[]>("public_universities.json"),
    loadJson<PublicRegisterEntry[]>("public_tvets.json"),
  ]);

  const items = [
    ...institutions.map(toPrivateRegisterItem),
    ...universities.map((u) => toPublicRegisterItem(u, "Public University", "ESTABLISHED — HIGHER EDUCATION ACT")),
    ...tvets.map((t) =>
      toPublicRegisterItem(t, "TVET College", "ESTABLISHED — CONTINUING EDUCATION AND TRAINING ACT"),
    ),
  ];

  await batchWrite(items);
  console.log(
    `Seeded ${items.length} institutions into "${TABLE_NAME}" ` +
      `(${institutions.length} private register, ${universities.length} public universities, ${tvets.length} TVET colleges).`,
  );
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});

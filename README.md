# eduverify-api

Standalone verification API for South African institutions and qualifications.
Reads from the same DynamoDB table `eduverify` ingests into; EduVerify's own web app is this
API's first client.

## Status: application code complete, no AWS infrastructure yet

`src/lib/` is forked (not shared via package) from `eduverify/web/lib/` — pure, dependency-free
TS with no AWS calls except `dynamodb.ts`, which talks to the real `eduverify-institutions`
table read-only.

`src/handlers/` (institutions, qualifications, verify, health), `src/matching/verifyQualification.ts`
(the fuzzy CV/HR qualification matcher), `src/tiers.ts`/`src/keyTiers.ts` (tier gating), and
`src/router.ts` (the single-Lambda internal router behind API Gateway's proxy integration) are
all implemented and unit-tested against mocked DynamoDB calls — see `src/router.ts`'s route
table for the full `/v1/*` surface.

**No AWS infrastructure for this repo exists yet** — no API Gateway, no IAM role, no deployed
Lambda, no `terraform/`. Nothing here has been exercised against a real or local DynamoDB table;
all tests mock `../lib/dynamodb`'s exported functions rather than running against DynamoDB Local.

## Commands

```bash
npm install
npm run test        # vitest
npm run typecheck    # tsc --noEmit
```

## Why fork instead of share a package

The lifted modules (`search.ts`, `normalize.ts`, `qualificationSearch.ts`, `presentation.ts`,
`facultiesAndProgrammes.ts`, `qualificationsMatching.ts`, `keys.ts`, `dynamodb.ts`, `types.ts`)
are small and independently unit-tested; a shared `@eduverify/core` npm package is a reasonable
future step if drift between the two copies becomes a real recurring cost, but isn't worth the
publish-pipeline overhead yet. `keys.ts` in particular mirrors `parser/dynamo_item.py` (Python)
and `web/lib/keys.ts` (TS) in the `eduverify` repo — if the slugify algorithm changes, all three
must change together, or lookups by id will miss rows in the shared table. `keys.test.ts` pins
known slugs against real institution names as the only automated guard against that drift.

## Adaptations from the original `web/lib` modules

- `search.ts`'s `searchLocal(query, filters, limit)` (which read a bundled local JSON seed)
  became `searchInstitutions(institutions, query, filters, limit)` — a pure ranking function
  over a caller-supplied candidate list, since this repo has no bundled seed; the caller
  (a future handler) supplies candidates from DynamoDB.
- `types.ts`'s `SaqaQualification` gained a required `framework` field (HEQSF/OQSF/GFETQSF/
  SFAP/SFNA) — see the corresponding parser change in `eduverify`.

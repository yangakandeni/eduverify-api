# eduverify-api

Standalone verification API for South African institutions and qualifications. Owns ingest
(`ingestion/`) → parse → write → serve (`src/`) end to end. EduVerify's own web app is this
API's first client, reading through it rather than a bundled seed or a directly-read table.

`src/lib/` is forked (not shared via package) from `eduverify/web/lib/` — pure, dependency-free
TS with no AWS calls except `dynamodb.ts`, which talks to the real institutions table
read-only.

`src/handlers/` (institutions, qualifications, verify, health), `src/matching/verifyQualification.ts`
(the fuzzy CV/HR qualification matcher), `src/tiers.ts`/`src/keyTiers.ts` (tier gating), and
`src/router.ts` (the single-Lambda internal router behind API Gateway's proxy integration) are
all implemented and unit-tested against mocked DynamoDB calls — see `src/router.ts`'s route
table for the full `/v1/*` surface. All tests mock `../lib/dynamodb`'s exported functions rather
than running against DynamoDB Local.

`ingestion/` (Python) is a canonical copy of the `eduverify` repo's `parser/` — the DHET
register scraper, plus `seed_dynamodb.py` for bulk-loading. It's deployed as a container-image
Lambda (`ingestion/Dockerfile`), provisioned by `terraform/ingestion/`. `eduverify`'s own
`parser/` and `terraform/main.tf` still exist too, deliberately — production there still reads
its own DynamoDB table directly until that cutover happens, so that copy stays live until it's
formally decommissioned. See `ingestion/CLAUDE.md` for details, including the account/state
topology this migration adopted rather than recreating.

## Commands

```bash
npm install
npm run test        # vitest
npm run typecheck    # tsc --noEmit
npm run docs         # serve Swagger UI at http://localhost:4000
```

## Local development (DynamoDB Local + curl/Postman)

No AWS infrastructure exists for this repo yet (see above), but the full `/v1/*` surface can
still be exercised locally against [DynamoDB Local](https://hub.docker.com/r/amazon/dynamodb-local)
seeded from the (gitignored, local-only) `data/*.json` fixtures — the DHET private register plus
public university/TVET lists, in the same shape `parser/dynamo_item.py` bakes into the real
table.

```bash
npm run dynamodb:local   # terminal 1 — docker run amazon/dynamodb-local on :8000
npm run seed:local       # terminal 2 — creates the table (if needed) and loads data/*.json
npm run dev              # terminal 2 — dev server on :3000, proxying to router.ts
```

Then hit any route directly, e.g.:

```bash
curl http://localhost:3000/v1/health
curl http://localhost:3000/v1/stats
curl "http://localhost:3000/v1/institutions/search?q=cape+town"
curl "http://localhost:3000/v1/institutions/list?page=1&pageSize=25"
curl -X POST http://localhost:3000/v1/institutions/verify \
  -H "Content-Type: application/json" \
  -d '{"registrationNumber": "2000/HE07/015"}'
```

Same in Postman: point requests at `http://localhost:3000/v1/...` — `x-api-key` is read from the
request header exactly like the deployed API Gateway route would (see `src/tiers.ts`).

- `scripts/dev-server.ts` is a plain Node HTTP server standing in for API Gateway's proxy
  integration — it translates a raw request into the same event shape `router.ts` is already
  unit-tested against, and nothing else. `PORT` (default `3000`) overrides the port.
- `scripts/seed-local-dynamodb.ts` creates the table/GSI1 if missing and batch-writes every
  fixture as an item shaped the way `src/lib/dynamodb.ts`'s `toRecord()` expects to read it back
  (public university/TVET entries get a synthesized `contacts`/`institutionType`, matching what
  eduverify's own `scripts/seed_dynamodb.py` does against the real table).
- Both scripts (and `src/lib/dynamodb.ts` itself) read `DYNAMODB_ENDPOINT` — set only for local
  dev, never in a deployed environment — to point the AWS SDK at DynamoDB Local with a fixed
  dummy credential pair instead of the real AWS endpoint/credentials.

## API docs

`docs/openapi.yaml` is the source-of-truth OpenAPI 3 spec for the full `/v1/*` surface —
every route, request/response shape, and error case in `src/router.ts`. `docs/index.html` is a
Swagger UI page that renders it, with "Try it out" enabled for every endpoint.

Run `npm run docs` and open http://localhost:4000 (a plain static server is needed rather than
opening `index.html` directly — browsers block a `file://` page from `fetch`-ing its sibling
`openapi.yaml`). The `servers` block in the spec is a placeholder API Gateway host — once
`terraform apply` has actually run, fill in the real `apiId` from `terraform output invoke_url`
(top of the Swagger UI page) to make "Try it out" hit the real deployment; until then, the docs
still fully describe the contract, they just have nothing live to call.

Update `docs/openapi.yaml` alongside any change to `src/router.ts` — new routes, changed request/
response shapes, or new error cases all belong there too.

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

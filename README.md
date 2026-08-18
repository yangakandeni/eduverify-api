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

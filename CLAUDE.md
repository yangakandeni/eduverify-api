# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.


## Learning about this codebase

Always use the `graphify` skill first when answering questions about this codebase's architecture, file relationships, or project content — treat it as the primary tool for codebase exploration, not a fallback. If `graphify-out/` exists, query it before searching the repo manually.

## Coding style

Every new feature, change, or bug fix must be built test-driven (TDD): write or update the automated test that covers the behavior before touching implementation code, and don't call the work done until it passes. See "Core Development Philosophy: Test-Driven Development (TDD)" below for the

## What this is

Standalone verification API for South African institutions and qualifications.
It reads from the same DynamoDB table (`eduverify-institutions`) that the separate `eduverify`
repo's parser ingests into; EduVerify's own web app is this API's first client, but the API is
designed for other consumers too (e.g. CV/HR qualification verification, which needs non-HEQSF
frameworks EduVerify's own product doesn't).

**Status: application code complete, no AWS infrastructure deployed yet.** Terraform exists in
`terraform/` but has never been applied — no API Gateway, IAM role, or Lambda exists. All tests
mock `../lib/dynamodb`'s exported functions; nothing has been exercised against a real or local
DynamoDB table.

## Commands

```bash
npm install
npm run test        # vitest run — all tests
npm run typecheck    # tsc --noEmit
npm run build        # esbuild bundle -> dist/index.cjs (Lambda entrypoint)
```

Run a single test file: `npx vitest run src/lib/keys.test.ts`
Run tests matching a name: `npx vitest run -t "some test name"`

## Architecture

**Single-Lambda internal router.** `src/router.ts` is the one entrypoint behind API Gateway's
proxy integration — it pattern-matches `event.httpMethod`/`event.path` and dispatches to
handlers. Route order matters: exact-match routes (search, list, verify) must be checked before
the `GET /v1/institutions/{id}` catch-all regex, which would otherwise swallow them.

**Layering:** `router.ts` -> `src/handlers/*` (HTTP-shaped request/response, thin) ->
`src/matching/verifyQualification.ts` or `src/lib/*` (pure logic) -> `src/lib/dynamodb.ts` (the
only module that talks to AWS). Keep that boundary: `src/lib/` besides `dynamodb.ts` is pure,
dependency-free TS with no AWS calls, unit-tested by passing in candidate arrays directly rather
than hitting DynamoDB.

**`src/lib/` is forked, not shared, from `eduverify/web/lib/`** (the separate `eduverify` repo).
There is no shared npm package by design — the modules are small and independently unit-tested,
and the fork is judged cheaper than publish-pipeline overhead for now. This has one sharp edge:
`src/lib/keys.ts`'s `slugify`/`institutionKey` must stay byte-for-byte in sync with
`parser/dynamo_item.py` (Python) and `web/lib/keys.ts` (TS) in the `eduverify` repo — all three
compute the same DynamoDB key format independently. If the algorithm changes in one place without
the other two, id-based lookups silently miss rows in the shared table. `keys.test.ts`'s
known-slug assertions against real institution names are the only automated guard against that
drift; when touching `keys.ts`, check whether the same change is needed in `eduverify`.

**DynamoDB access pattern (`src/lib/dynamodb.ts`):**
- Single table, PK-based `GetItem` for direct id/registration-number lookups.
- GSI1 (`GSI1PK` = uppercased status, `GSI1SK` = name) for name-prefix search and status-based
  listing. There is no native "list everything paginated by page number," so `queryAllByStatus`
  fetches a full partition (following `LastEvaluatedKey`) and callers paginate/filter in memory —
  fine at current data scale (low thousands of institutions per status), not designed to survive
  an order-of-magnitude growth.
- `STATUS_PARTITIONS` is the exhaustive list of `GSI1PK` values written by both the ingestion
  parser and the seed script. Any GSI1-based query (search, list) must enumerate every partition
  in that list or affected institutions become invisible to those queries — even though a direct
  `GetItem` by PK still finds them. Keep this list in sync with whatever writes the table.
- `toRecord()` defaults `institutionType` to `"Private Higher Education Institution"` only when
  an item doesn't already carry one (true for private-register items, never for seeded public
  universities/TVET colleges), and defaults `faculties_and_programmes` to `[]` for items ingested
  via the live S3->Lambda path that bypasses the enrichment ("bake") step.

**Tiering (`src/tiers.ts` + `src/keyTiers.ts`):** API Gateway usage plans handle rate/quota limits
natively; the code-level tier config only handles feature gating usage plans can't express (e.g.
whether a key can call `/v1/qualifications/verify/batch` at all, and its max batch size). There is
no self-serve signup in v1 — keys are issued manually, and the apiKey->tier mapping is supplied at
deploy time via the `EDUVERIFY_API_KEY_TIERS` env var (JSON), never committed to source. An
unrecognized or missing key always resolves to the `free` tier.

**Qualification matching (`src/matching/verifyQualification.ts`):** given a claimed
(qualification title, institution name) pair — the CV/HR verification use case — finds the
institution via the same fuzzy `searchInstitutions` ranking used for search-as-you-type, then
checks its `faculties_and_programmes` for an exact-normalized or fuzzy title match. Confidence is
`"exact"` / `"fuzzy"` / `"none"`, distinct from `verifyInstitution`'s `"exact"` / `"high"` /
`"none"` (a different use case: loan-org identity verification wants a boolean-ish high-confidence
answer, not a ranked list).

**Data model note:** `SaqaQualification.framework` (HEQSF/OQSF/GFETQSF/SFAP/SFNA) is required here
even though EduVerify's own product is HEQSF-only — this API's other consumers need the full NQF
sub-framework range. If `types.ts` changes here, check whether the corresponding parser/type in
`eduverify` needs the same change.

## Infrastructure (`terraform/`, not yet applied)

- Reuses the *same* S3 state bucket + DynamoDB lock table that the separate `eduverify` repo's
  Terraform already provisioned in this AWS account, under a different state `key` — this repo's
  state is never bootstrapped independently, but the two repos' actual state stays isolated.
- The DynamoDB table itself (and its GSI1) is owned and written by `eduverify`'s Terraform, not
  this repo's — its ARNs are passed in as plain variables (`dynamodb_table_arn`,
  `dynamodb_gsi_arn`), not resolved via `terraform_remote_state`, to keep the two repos' deploy
  pipelines decoupled.
- `project_name` here (`eduverify-api-staging`) is deliberately distinct from `eduverify`'s own
  project naming — an unsuffixed IAM role name collided with `eduverify`'s ingestion Lambda role
  in this same account on first apply.
- `api_key_tiers_json` can't be derived from `module.usage_plans`' output without creating a
  dependency cycle (Lambda env -> usage plan -> API Gateway -> Lambda invoke ARN). Bootstrap order
  is: apply once with it left as `"{}"` to create the API keys, read real values via
  `terraform output -json api_key_values`, then set `TF_VAR_api_key_tiers_json` (or a gitignored
  secrets tfvars file) and apply again. Never commit real key values.
- Region is `af-south-1` to match `eduverify`'s own in-country residency/latency choice, since
  this Lambda talks to that region's table.

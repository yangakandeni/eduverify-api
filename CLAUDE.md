# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.


## Learning about this codebase

Always use the `graphify` skill first when answering questions about this codebase's architecture, file relationships, or project content — treat it as the primary tool for codebase exploration, not a fallback. If `graphify-out/` exists, query it before searching the repo manually.

## Coding style

Every new feature, change, or bug fix must be built test-driven (TDD): write or update the automated test that covers the behavior before touching implementation code, and don't call the work done until it passes. See "Core Development Philosophy: Test-Driven Development (TDD)" below for the

## What this is

Standalone verification API for South African institutions and qualifications, now owning
ingest → parse → write (`ingestion/`) as well as serving (`src/`). EduVerify's own web app is
this API's first client, but the API is released for external developers too — the target use
case is form-field autocomplete/verification (an institution or qualification picker, similar in
spirit to what getAddress.io does for postal addresses), not a bundled EduVerify feature. Other
consumers need non-HEQSF frameworks EduVerify's own product doesn't.

The serving side (`src/`, `terraform/{main.tf,modules/{iam_api,lambda_api,api_gateway,
usage_plans}}`) reads the institutions DynamoDB table read-only; all its tests mock
`../lib/dynamodb`'s exported functions rather than running against DynamoDB Local.

**Ingestion ownership migrated here from the separate `eduverify` repo** — see "Ingestion"
below. `eduverify`'s own `parser/` and `terraform/main.tf` still exist too, deliberately:
production there still reads its own (different) DynamoDB table directly until that cutover
happens, so that copy stays live/legacy until formally decommissioned. Don't assume `eduverify`
no longer has ingestion code — it does, on purpose, for now.

## Ingestion (`ingestion/`, `terraform/ingestion/`)

Python DHET-register scraper + `seed_dynamodb.py`, a canonical copy of `eduverify/parser/`
(see `ingestion/CLAUDE.md` for the pipeline's own architecture — pdf_extract → grouping →
extraction → build → dynamo_item, all unchanged from the original). Deployed as a
container-image Lambda (`ingestion/Dockerfile`, `public.ecr.aws/lambda/python:3.12` base)
rather than the legacy zip+dependency-layer approach, since this repo had no existing
zip/layer-build tooling to extend.

`terraform/ingestion/` is a separate root from the serving stack's `terraform/` (mirrors how
`eduverify` itself split `main.tf` from `data-stack/`) — provisions its own S3 bucket, DynamoDB
table, IAM role, and the ingestion Lambda, sharing the same AWS account as the serving stack.
It **adopts** `eduverify/terraform/data-stack`'s already-live state (identical backend
bucket/key in `terraform/ingestion/environments/*.backend.hcl`) rather than creating fresh
resources — state lives in S3, keyed by backend config, not by which repo's `.tf` files
reference it. Never apply from here without first confirming an empty `terraform plan` against
the adopted state.

This algorithm now has four independent copies across two repos that must stay byte-for-byte
in sync: `ingestion/dynamo_item.py` and `eduverify/parser/dynamo_item.py` (Python), plus
`src/lib/keys.ts` (this repo) and `eduverify/web/lib/keys.ts` (TypeScript) — see
`ingestion/CLAUDE.md` and the existing `keys.ts` fork-drift warning below.

## Commands

```bash
npm install
npm run test        # vitest run — all tests
npm run typecheck    # tsc --noEmit
npm run build        # esbuild bundle -> dist/index.cjs (Lambda entrypoint)
```

Run a single test file: `npx vitest run src/lib/keys.test.ts`
Run tests matching a name: `npx vitest run -t "some test name"`

Ingestion commands (run from `ingestion/`, see `ingestion/CLAUDE.md`):

```bash
python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
python -m pytest              # all ingestion tests
docker build -f Dockerfile -t eduverify-api-ingestion .
```

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
(qualification title, institution name) pair — the form-verification use case, e.g. confirming a
self-reported qualification field — finds the institution via the same fuzzy
`searchInstitutions` ranking used for search-as-you-type, then checks its
`faculties_and_programmes` for an exact-normalized or fuzzy title match. Confidence is `"exact"` /
`"fuzzy"` / `"none"`, distinct from `verifyInstitution`'s `"exact"` / `"high"` / `"none"` (a
narrower use case: confirming a typed/autocompleted institution name or registration number is
real wants a boolean-ish high-confidence answer, not a ranked list).

**Data model note:** `SaqaQualification.framework` (HEQSF/OQSF/GFETQSF/SFAP/SFNA) is required here
even though EduVerify's own product is HEQSF-only — this API's other consumers need the full NQF
sub-framework range. If `types.ts` changes here, check whether the corresponding parser/type in
`eduverify` needs the same change.

## Infrastructure — serving stack (`terraform/{main.tf,modules/{iam_api,lambda_api,api_gateway,usage_plans}}`)

(See "Ingestion" above for `terraform/ingestion/`, a separate root/stack within this same repo.)

- Reuses the *same* S3 state bucket + DynamoDB lock table that the separate `eduverify` repo's
  Terraform already provisioned in this AWS account, under a different state `key` — this repo's
  state is never bootstrapped independently, but the two repos' actual state stays isolated.
- The DynamoDB table itself (and its GSI1) is owned and written by a separate root, not this
  serving stack's — its ARNs are passed in as plain variables (`dynamodb_table_arn`,
  `dynamodb_gsi_arn`), not resolved via `terraform_remote_state`, to keep deploy pipelines
  decoupled. That table used to be owned by the separate `eduverify` repo's Terraform
  (`terraform/data-stack`); it's now owned by this same repo's `terraform/ingestion/`, but the
  serving stack's own decoupling (plain variables, not remote state) didn't need to change.
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

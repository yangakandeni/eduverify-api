# ingestion/CLAUDE.md

Guidance for working in `ingestion/`. This is a canonical copy of the `eduverify` repo's
`parser/`, migrated here so `eduverify-api` owns ingest → parse → write, not just serving.
`eduverify`'s own `parser/` and `terraform/main.tf` deliberately still exist too — production
there still reads its own DynamoDB table directly (`USE_EXTERNAL_API=false`), and deleting
that copy before the cutover would be a real outage. Treat that copy as legacy/frozen; this
one is canonical going forward.

## Commands (run from `ingestion/`)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m pytest                                    # all tests
python -m pytest tests/test_extraction.py           # single file
python -m pytest tests/test_extraction.py -k name   # single test
python fetch_and_parse.py                          # download latest DHET PDF, write ./data/institutions.json
python fetch_and_parse.py --pdf-path FILE          # parse an already-downloaded PDF instead
python fetch_and_parse_qualifications.py           # download latest SAQA NLRD register, write ./data/qualifications.json
python seed_dynamodb.py --data-path ./data/institutions.json --table-name eduverify-api-staging-institutions
```

Tests import modules directly (`from build import ...`, no package prefix) — invoke with `python -m pytest` (not the bare `pytest` script) from `ingestion/` so cwd is on `sys.path`; running from the repo root, or via the bare `pytest` command, breaks imports.

`seed_dynamodb.py` has no default data paths (unlike its original location in `eduverify`, which had committed `data/institutions.json`/`web/lib/data/public_universities.json`/`public_tvets.json` to point at by default) — this repo doesn't bundle that static data, so `--data-path` and `--table-name` are required, and `--public-universities-path`/`--public-tvets-path` are optional (omit to seed private institutions only, or pass `--skip-public`).

**After re-running `fetch_and_parse.py`, the output's `qualifications` field is raw, unmatched
scraped strings — SAQA-matched `faculties_and_programmes` must be re-baked in before the file is
seeded.** That baking step (`web/scripts/bakeFacultiesAndProgrammes.ts`) lives in the `eduverify`
repo, not here — it's a Node/TS script over `eduverify`'s own `data/institutions.json` and
`data/qualifications.json`. If you're producing a fresh dataset for this repo's table, bake it in
`eduverify` first, then point `seed_dynamodb.py --data-path` at the baked output. The live
S3→Lambda ingestion path (`lambda_handler.py`) does **not** run this bake step — institutions
ingested that way lack `faculties_and_programmes` until the next manual reseed, same as before
the migration.

## Architecture

One-way, composable stages, each independently unit-tested and side-effect-free where possible:

1. `pdf_extract.iter_status_rows` — walks the PDF via `pdfplumber`, tagging every table row with the registration-status section it's under. The Annexure A register has 6 numbered sections, all of which are now surfaced (none are silently dropped):
   1. **REGISTERED INSTITUTIONS** — tabular (NAME/ADDRESS/REG-NO/PROVINCE/QUALIFICATIONS), parsed as status `"Registered"`.
   2. **PROVISIONALLY REGISTERED INSTITUTIONS** — same tabular layout, parsed as status `"Provisionally Registered"`.
   3. **THE REGISTRATION OF THE FOLLOWING INSTITUTIONS ARE CANCELLED...** — same 6-column tabular layout as sections 1-2, tagged status `"Cancelled"` by `_CANCELLED_RE` and grouped through the same `grouping.group_table_rows` pipeline. (DHET also lists some cancelled institutions inside section 2 with a cancellation-notice phrase instead of using this section, which is why `build.record_to_institution`'s `has_cancellation_notice` override still matters independently of this section.)
   4. **INSTITUTIONS FOR WHICH CANCELLATION OR LAPSE OF REGISTRATION HAS COME INTO EFFECT** — a numbered list of institution *names only* ("1) Some College"), not a table row `iter_status_rows` can yield. Read from each page's plain text by `pdf_extract.iter_name_list_entries` / `parse_name_list_lines`, tagged status `"Cancelled"`.
   5. **INSTITUTIONS WHICH HAVE REQUESTED THAT THE REGISTRAR DISCONTINUE THEIR REGISTRATION** — same numbered-list-of-names format as section 4, also read by `iter_name_list_entries`, tagged status `"Discontinued"`.
   6. **WARNING: ILLEGAL COLLEGES ALSO KNOWN AS BOGUS COLLEGES** — *is* a real pdfplumber table, but incompatible with the 6-column schema: the "N." index is embedded in the NAME cell itself (not a separate column) and the column count varies page to page. Tagged status `"Bogus"` by `_BOGUS_RE` and grouped separately by `grouping.group_bogus_rows`, which tracks only the NAME column (address/programme detail isn't needed for a warning list and isn't laid out consistently enough to parse).
2. `grouping.group_table_rows` — the DHET table wraps one institution across multiple physical rows (and page breaks); a new record starts only when the leading index column ("1.", "2.", ...) is populated, everything else is a continuation appended to the current record. Handles sections 1-3.
3. `extraction.py` — pure regex helpers that pull structured fields (name, phones, emails, website, registration number, address, qualification list) out of a grouped record's raw multi-line cell text.
4. `build.record_to_institution` — assembles a validated `models.Institution` (pydantic) from a grouped record, returning `None` for unparseable rows rather than raising. A section 4-6 record has only `name_block` populated (no address/reg-no/qualifications), which is fine since `Institution` only requires a name.
5. `build.build_institutions(pdf_path)` — the single entry point that assembles all 6 sections: filters `iter_status_rows` by status to route sections 1-3 through `group_table_rows` and section 6 through `group_bogus_rows`, appends sections 4-5 from `iter_name_list_entries`, then runs every record through `record_to_institution`. Both `fetch_and_parse.py` (CLI, writes a local `institutions.json`) and `lambda_handler.py` (S3-triggered production ingestion, writes to DynamoDB via `dynamo_item.to_item` and drops a JSON backup to S3) call this one function rather than duplicating the assembly logic.

`dynamo_item.to_item`/`institution_key` is the single source of truth for how an institution is
keyed (`INST#<registration_number>`, or `INST#NAME#<slug>` when no registration number exists) —
both `lambda_handler.py` and `seed_dynamodb.py` import it so live ingestion and bulk seeding key
records identically. **This algorithm now has four independent copies across two repos** that
must stay byte-for-byte in sync: this file, `eduverify/parser/dynamo_item.py` (Python, the
still-live legacy copy), `eduverify/web/lib/keys.ts` (TypeScript), and this repo's own
`src/lib/keys.ts` (TypeScript, the serving side). Changing the algorithm in one place without the
other three means id-based lookups silently miss rows.

"""Bulk-upload data/institutions.json, plus the hand-maintained public universities/TVET
colleges (web/lib/data/public_universities.json, public_tvets.json), into the
eduverify-institutions DynamoDB table.

data/institutions.json's raw records (private DHET register institutions) carry no
institutionType field — dynamo_item.to_item() spreads them as-is, and downstream readers
(web/lib/dynamodb.ts, eduverify-api's src/lib/dynamodb.ts) default a missing institutionType
to "Private Higher Education Institution". Public universities/TVETs need the field set
explicitly here, mirroring what web/lib/publicUniversities.ts / publicTvets.ts already do
client-side for the bundled local-JSON path.

Usage:
    python ingestion/seed_dynamodb.py --data-path /path/to/institutions.json
    python ingestion/seed_dynamodb.py --table-name eduverify-api-staging-institutions --region af-south-1
    python ingestion/seed_dynamodb.py --endpoint-url http://localhost:8000   # DynamoDB Local
    python ingestion/seed_dynamodb.py --skip-public   # private institutions only

No default data paths are set: this repo doesn't bundle data/institutions.json or the
hand-maintained public university/TVET JSON the way the eduverify repo's web/ does — pass
--data-path (and, optionally, --public-universities-path/--public-tvets-path) explicitly,
pointing at wherever those files are checked out.
"""

import argparse
import json
import sys
from pathlib import Path

import boto3

from dynamo_item import to_item


def _public_institution_to_dict(raw, *, institution_type, status):
    return {
        "name": raw["name"],
        "abbreviation": raw.get("abbreviation"),
        "registration_number": None,
        "status": status,
        "address": raw["address"],
        "province": raw["province"],
        "contacts": {"email": [], "phone": [], "website": raw.get("website")},
        "faculties_and_programmes": raw.get("faculties_and_programmes", []),
        "institutionType": institution_type,
    }


def public_university_to_institution(raw):
    return _public_institution_to_dict(
        raw, institution_type="Public University", status="Established — Higher Education Act"
    )


def public_tvet_to_institution(raw):
    return _public_institution_to_dict(
        raw, institution_type="TVET College", status="Established — Continuing Education and Training Act"
    )


def load_public_institutions(universities_path, tvets_path):
    institutions = []
    if universities_path is not None and universities_path.exists():
        raw_universities = json.loads(universities_path.read_text())
        institutions.extend(public_university_to_institution(u) for u in raw_universities)
    if tvets_path is not None and tvets_path.exists():
        raw_tvets = json.loads(tvets_path.read_text())
        institutions.extend(public_tvet_to_institution(t) for t in raw_tvets)
    return institutions


def seed(table, institutions):
    written = 0
    with table.batch_writer() as batch:
        for institution in institutions:
            batch.put_item(Item=to_item(institution))
            written += 1
    return written


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-path", type=Path, required=True, help="Path to institutions.json")
    parser.add_argument("--public-universities-path", type=Path, default=None)
    parser.add_argument("--public-tvets-path", type=Path, default=None)
    parser.add_argument("--skip-public", action="store_true", help="Seed private institutions only")
    parser.add_argument("--table-name", required=True, help="e.g. eduverify-api-staging-institutions")
    parser.add_argument("--region", default="af-south-1")
    parser.add_argument(
        "--endpoint-url",
        default=None,
        help="Override endpoint, e.g. http://localhost:8000 for DynamoDB Local",
    )
    args = parser.parse_args()

    if not args.data_path.exists():
        print(f"Error: {args.data_path} does not exist", file=sys.stderr)
        return 1

    institutions = json.loads(args.data_path.read_text())
    public_count = 0
    if not args.skip_public:
        public_institutions = load_public_institutions(args.public_universities_path, args.public_tvets_path)
        public_count = len(public_institutions)
        institutions = institutions + public_institutions

    dynamodb = boto3.resource("dynamodb", region_name=args.region, endpoint_url=args.endpoint_url)
    table = dynamodb.Table(args.table_name)

    written = seed(table, institutions)
    print(f"Wrote {written} institutions to table '{args.table_name}' ({public_count} public universities/TVETs)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

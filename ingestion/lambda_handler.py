"""AWS Lambda entry point: parses a DHET register PDF uploaded to S3 and
upserts the resulting institution records into DynamoDB, with a JSON
backup dump written alongside the raw upload.

Triggered by S3 ObjectCreated events under the `raw/` prefix (see the
terraform/modules/lambda notification wiring).
"""

import json
import os
from pathlib import Path

import boto3

from build import build_institutions
from dynamo_item import to_item

TABLE_NAME = os.environ["DYNAMODB_TABLE"]
BACKUP_PREFIX = os.environ.get("BACKUP_PREFIX", "backups/")

s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")


def _process_pdf(bucket, key, table):
    local_pdf = Path("/tmp") / Path(key).name
    s3.download_file(bucket, key, str(local_pdf))

    institutions = build_institutions(local_pdf)

    with table.batch_writer() as batch:
        for institution in institutions:
            batch.put_item(Item=to_item(institution.model_dump()))

    backup_key = f"{BACKUP_PREFIX}{Path(key).stem}.json"
    s3.put_object(
        Bucket=bucket,
        Key=backup_key,
        Body=json.dumps([i.model_dump() for i in institutions], ensure_ascii=False, indent=2).encode("utf-8"),
        ContentType="application/json",
    )

    return {
        "source_key": key,
        "backup_key": backup_key,
        "total_written": len(institutions),
    }


def handler(event, context):
    table = dynamodb.Table(TABLE_NAME)
    return {
        "processed": [
            _process_pdf(record["s3"]["bucket"]["name"], record["s3"]["object"]["key"], table)
            for record in event.get("Records", [])
        ]
    }

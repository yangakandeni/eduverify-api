"""Shape a parsed institution record (plain dict, e.g. from Institution.model_dump())
into a DynamoDB item. Shared by lambda_handler.py and scripts/seed_dynamodb.py so both
the live ingestion path and the bulk seed script key records identically.
"""

import re
import unicodedata


def slugify(value):
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^A-Za-z0-9]+", "-", value).strip("-").upper()


def institution_key(institution):
    """Registration numbers aren't always present in the source register,
    so records missing one fall back to a slug of the name to avoid
    collapsing onto a shared PK."""
    registration_number = institution.get("registration_number")
    if registration_number:
        return f"INST#{registration_number}"
    return f"INST#NAME#{slugify(institution['name'])}"


def to_item(institution):
    item = dict(institution)
    item["PK"] = institution_key(institution)
    item["GSI1PK"] = (institution.get("status") or "UNKNOWN").upper()
    item["GSI1SK"] = institution["name"]
    return item

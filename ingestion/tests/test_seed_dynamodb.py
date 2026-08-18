"""Run from the repo root: python -m pytest ingestion/tests/ -v
(seed_dynamodb.py and dynamo_item.py are siblings directly under ingestion/, so this file's
own sys.path.insert of ingestion/ below is enough to import both — no extra path hack needed.)
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from seed_dynamodb import public_tvet_to_institution, public_university_to_institution  # noqa: E402
from dynamo_item import to_item  # noqa: E402


def test_public_university_to_institution_sets_type_and_no_registration_number():
    raw = {
        "name": "University of Cape Town",
        "abbreviation": "UCT",
        "address": "Rondebosch, Cape Town",
        "province": "Western Cape",
        "website": "www.uct.ac.za",
        "faculties_and_programmes": [{"faculty": "Law", "programmes": []}],
    }

    institution = public_university_to_institution(raw)

    assert institution["name"] == "University of Cape Town"
    assert institution["institutionType"] == "Public University"
    assert institution["registration_number"] is None
    assert institution["province"] == "Western Cape"
    assert institution["faculties_and_programmes"] == [{"faculty": "Law", "programmes": []}]
    assert institution["contacts"]["website"] == "www.uct.ac.za"


def test_public_university_to_institution_produces_a_name_keyed_dynamodb_item():
    raw = {
        "name": "University of Cape Town",
        "abbreviation": "UCT",
        "address": "Rondebosch, Cape Town",
        "province": "Western Cape",
        "website": "www.uct.ac.za",
        "faculties_and_programmes": [],
    }

    item = to_item(public_university_to_institution(raw))

    assert item["PK"] == "INST#NAME#UNIVERSITY-OF-CAPE-TOWN"
    assert item["institutionType"] == "Public University"


def test_public_tvet_to_institution_sets_type_and_no_registration_number():
    raw = {
        "name": "Buffalo City TVET College",
        "abbreviation": "BCC",
        "address": "Southernwood, East London",
        "province": "Eastern Cape",
        "website": "www.bccollege.co.za",
        "faculties_and_programmes": [],
    }

    institution = public_tvet_to_institution(raw)

    assert institution["institutionType"] == "TVET College"
    assert institution["registration_number"] is None
    assert institution["status"] == "Established — Continuing Education and Training Act"


def test_public_tvet_to_institution_produces_a_name_keyed_dynamodb_item():
    raw = {
        "name": "Buffalo City TVET College",
        "abbreviation": "BCC",
        "address": "Southernwood, East London",
        "province": "Eastern Cape",
        "website": "www.bccollege.co.za",
        "faculties_and_programmes": [],
    }

    item = to_item(public_tvet_to_institution(raw))

    assert item["PK"] == "INST#NAME#BUFFALO-CITY-TVET-COLLEGE"
    assert item["institutionType"] == "TVET College"

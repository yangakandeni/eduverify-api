"""Integration test against the cached real DHET register PDF (fixtures/).

This exercises the full pipeline (pdf_extract -> grouping -> build) end to
end against real, messy government-document data rather than hand-crafted
fixtures, to catch structural surprises the unit tests can't.
"""

import os

import pytest

from build import build_institutions, record_to_institution
from grouping import group_table_rows
from pdf_extract import iter_status_rows

FIXTURE_PDF = os.path.join(os.path.dirname(__file__), "..", "fixtures", "annexure_a_sample.pdf")

pytestmark = pytest.mark.skipif(not os.path.exists(FIXTURE_PDF), reason="sample PDF fixture not present")


def test_first_registered_institution_parses_correctly():
    records = group_table_rows(iter_status_rows(FIXTURE_PDF))
    first = records[0]
    assert first["status"] == "Registered"
    assert first["registration_number"] == "2000/HE07/015"

    inst = record_to_institution(first)
    assert inst.name == "AAA School of Advertising (Pty) Ltd"
    assert inst.province == "Gauteng"


def test_both_status_sections_are_present_in_reasonable_numbers():
    records = group_table_rows(iter_status_rows(FIXTURE_PDF))
    statuses = [r["status"] for r in records]
    assert statuses.count("Registered") > 50
    assert statuses.count("Provisionally Registered") > 50


def test_pipeline_never_crashes_and_produces_institutions_for_most_rows():
    records = group_table_rows(iter_status_rows(FIXTURE_PDF))
    institutions = [record_to_institution(r) for r in records]
    parsed = [i for i in institutions if i is not None]
    assert len(parsed) > 0.8 * len(records)


def test_bogus_section_rows_are_tagged_bogus_not_excluded():
    """Section 6 ("WARNING: ILLEGAL COLLEGES ALSO KNOWN AS BOGUS COLLEGES") used
    to be dropped outright via the "Excluded" status; it's now tagged "Bogus"
    so `build.build_institutions` can surface it as a warning list."""
    records = group_table_rows(iter_status_rows(FIXTURE_PDF))
    assert all(r["status"] != "Excluded" for r in records)


def test_build_institutions_surfaces_cancelled_discontinued_and_bogus_institutions():
    institutions = build_institutions(FIXTURE_PDF)
    by_status = {}
    for inst in institutions:
        by_status.setdefault(inst.status, []).append(inst.name)

    assert len(by_status.get("Cancelled", [])) > 50
    assert len(by_status.get("Discontinued", [])) > 5
    assert len(by_status.get("Bogus", [])) > 100

    assert any("Camelot International" in name for name in by_status["Cancelled"])  # section 3, tabular
    assert any("Academy of Advanced Technology" in name for name in by_status["Cancelled"])  # section 4, name-only
    assert any("Reebok Education" in name for name in by_status["Discontinued"])
    assert any("Barkley University" in name for name in by_status["Bogus"])
    assert any("Fargo University" in name for name in by_status["Bogus"])


def test_build_institutions_never_crashes_on_the_full_fixture():
    institutions = build_institutions(FIXTURE_PDF)
    assert len(institutions) > 0
    assert all(inst.name for inst in institutions)

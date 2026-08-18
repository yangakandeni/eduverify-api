import openpyxl
import pytest

from qualifications_extract import build_qualifications, parse_nqf_level, row_to_qualification

ROW_1 = {
    "NQF Sub-Framework": "HEQSF",
    "Qual ID": 101772,
    "Qualification Title": "Advanced Certificate in Business Management and Administration",
    "NQF Level": "NQF Level 06",
    "Min Credits": 120,
    "Originator": "Stellenbosch University",
    "Subfield": "Generic Management",
}

ROW_MISSING_TITLE = {
    "NQF Sub-Framework": "HEQSF",
    "Qual ID": 999,
    "Qualification Title": "",
    "NQF Level": "NQF Level 06",
    "Min Credits": 120,
    "Originator": "Stellenbosch University",
    "Subfield": "Generic Management",
}

ROW_MISSING_ORIGINATOR = {
    "NQF Sub-Framework": "HEQSF",
    "Qual ID": 998,
    "Qualification Title": "Some Qualification",
    "NQF Level": "NQF Level 06",
    "Min Credits": 120,
    "Originator": "",
    "Subfield": "Generic Management",
}


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("NQF Level 06", 6),
        ("NQF Level 01", 1),
        ("NQF Level 10", 10),
        ("Level TBA: Pre-2009 was L4", 4),
        ("Level N/A: Pre-2009 was L7", 7),
        ("Not Applicable", None),
        ("", None),
        (None, None),
    ],
)
def test_parse_nqf_level(raw, expected):
    assert parse_nqf_level(raw) == expected


def test_row_to_qualification_full():
    qual = row_to_qualification(ROW_1)
    assert qual is not None
    assert qual.qualId == 101772
    assert qual.title == "Advanced Certificate in Business Management and Administration"
    assert qual.nqfLevel == 6
    assert qual.nqfLevelRaw == "NQF Level 06"
    assert qual.credits == 120
    assert qual.originator == "Stellenbosch University"
    assert qual.subfield == "Generic Management"
    assert qual.framework == "HEQSF"


def test_row_to_qualification_returns_none_when_title_missing():
    assert row_to_qualification(ROW_MISSING_TITLE) is None


def test_row_to_qualification_returns_none_when_originator_missing():
    assert row_to_qualification(ROW_MISSING_ORIGINATOR) is None


HEADER = [
    "NQF Sub-Framework",
    "Qual ID",
    "Qualification Title",
    "NQF Level",
    "Min Credits",
    "Regis End Date",
    "Originator",
    "Field",
    "Subfield",
    "Is this a Learning Prog?",
    "Qual against which LP is recorded",
]


def _write_workbook(path, rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(HEADER)
    for row in rows:
        ws.append(row)
    wb.save(path)


def test_build_qualifications_maps_fields_and_preserves_framework(tmp_path):
    xlsx_path = tmp_path / "quals.xlsx"
    _write_workbook(
        xlsx_path,
        [
            ["HEQSF", 101772, "Advanced Certificate in Business Management", "NQF Level 06", 120, "30-Jun-2027", "Stellenbosch University", 3, "Generic Management", None, ""],
            ["HEQSF", 116842, "Advanced Certificate in Education in Arts and Culture", "NQF Level 06", 120, "31-Dec-2018", "Stellenbosch University", 5, "Schooling", None, 20473],
            ["OQSF", 55555, "Some Occupational Qualification", "NQF Level 04", 20, "30-Jun-2020", "Some Training Provider", 1, "Undefined", None, ""],
        ],
    )

    qualifications = build_qualifications(xlsx_path)

    assert len(qualifications) == 3
    assert {q.qualId for q in qualifications} == {101772, 116842, 55555}
    by_id = {q.qualId: q for q in qualifications}
    assert by_id[101772].framework == "HEQSF"
    assert by_id[116842].framework == "HEQSF"
    assert by_id[55555].framework == "OQSF"
    assert by_id[55555].originator == "Some Training Provider"

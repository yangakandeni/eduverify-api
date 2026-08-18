"""Tests for pdf_extract.parse_name_list_lines — the pure line-scanner behind
sections 4 ("Cancelled") and 5 ("Discontinued") of the register, which list
institutions by name only rather than as table rows."""

from pdf_extract import parse_name_list_lines

SECTION_4_LINES = [
    "3. Wilgeheuwel College",
    "4. INSTITUTIONS FOR WHICH CANCELLATION OR LAPSE OF REGISTRATION HAS COME INTO EFFECT",
    "A de-registered institution is an institution whose registration has been cancelled.",
    "1) Academy of Advanced Technology",
    "2) Academy of Financial Markets",
    "- 171 -",
    "3) Bantori Business College (Pty) Ltd",
]

SECTION_5_LINES = [
    "5. INSTITUTIONS WHICH HAVE REQUESTED THAT THE REGISTRAR DISCONTINUE THEIR REGISTRATION",
    "Institutions may request that the Registrar discontinue their registration.",
    "1) Complimentary Body Works (Pty) Ltd t/a Complementary Health Centre",
    "2) Reebok Education (Pty) Ltd",
]


def test_ignores_lines_before_any_section_header():
    assert list(parse_name_list_lines(["1. Some Registered College", "2) Not a real entry yet"])) == []


def test_extracts_numbered_entries_after_section_4_header_as_cancelled():
    entries = list(parse_name_list_lines(SECTION_4_LINES))
    assert entries == [
        ("Cancelled", "Academy of Advanced Technology"),
        ("Cancelled", "Academy of Financial Markets"),
        ("Cancelled", "Bantori Business College (Pty) Ltd"),
    ]


def test_extracts_numbered_entries_after_section_5_header_as_discontinued():
    entries = list(parse_name_list_lines(SECTION_5_LINES))
    assert entries == [
        ("Discontinued", "Complimentary Body Works (Pty) Ltd t/a Complementary Health Centre"),
        ("Discontinued", "Reebok Education (Pty) Ltd"),
    ]


def test_section_5_header_switches_status_and_stops_yielding_section_4_entries():
    entries = list(parse_name_list_lines(SECTION_4_LINES + SECTION_5_LINES))
    statuses = {status for status, _name in entries}
    assert statuses == {"Cancelled", "Discontinued"}
    assert entries[-1] == ("Discontinued", "Reebok Education (Pty) Ltd")


def test_bogus_colleges_header_terminates_the_discontinued_list():
    lines = SECTION_5_LINES + [
        "6. WARNING: ILLEGAL COLLEGES ALSO KNOWN AS BOGUS COLLEGES",
        "1) Some Bogus College",  # section 6's real entries come from group_bogus_rows, not here
    ]
    entries = list(parse_name_list_lines(lines))
    assert entries == [
        ("Discontinued", "Complimentary Body Works (Pty) Ltd t/a Complementary Health Centre"),
        ("Discontinued", "Reebok Education (Pty) Ltd"),
    ]


def test_page_footer_and_intro_paragraph_lines_are_not_mistaken_for_entries():
    entries = list(parse_name_list_lines(SECTION_4_LINES))
    names = [name for _status, name in entries]
    assert "- 171 -" not in names
    assert not any("de-registered institution" in name for name in names)

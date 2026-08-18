"""Tests for pure text-parsing helpers, using raw text blocks captured from the
real DHET Annexure A register (extracted via pdfplumber table extraction)."""

from extraction import (
    clean_address,
    extract_cancellation_reason,
    extract_emails,
    extract_name,
    extract_registration_number,
    extract_website,
    extract_phones,
    has_cancellation_notice,
    split_qualifications,
)


NAME_CONTACT_BLOCK_1 = (
    "AAA School of Advertising\n(Pty) Ltd\nCONTACT PERSON:\nDr Muni Kooblal\n"
    "Academic Registrar"
)

NAME_CONTACT_BLOCK_2 = (
    "Academy for Facility\nManagement (Pty) Ltd (A4FM)\nCONTACT PERSON:\n"
    "Mrs M Dimas\nAcademic Administrator\n(012) 993 0533(T)\nWebsite:\n"
    "www.a4fm.ac.za\nEmail Address:\nadmin@a4fm.ac.za\njge@a4fm.ac.za"
)

CONTINUATION_BLOCK_NO_NAME = (
    "031 307 7170 (F)\nWebsite:\nwww.aaaschool.co.za\nEmail Address:\n"
    "mkooblal@richfield.ac.za\nPrivate Bag X23\nUmhlanga Rocks\n4320"
)

NAME_CONTACTS_PLURAL_BLOCK = (
    "College of Transfiguration NPC\nCONTACTS:\nMs Tamara Heber\nLibrarian\n"
    "(046) 622 3332 (T)\nWebsite:\nwww.catt.co.za"
)

NAME_NO_CONTACT_LABEL_BLOCK = (
    "International Hotel School (Pty)\nLtd (The)\nMs Jolanda Bierman\n"
    "(031) 536 6650 (T)\n0865320016 (F)\nWebsite:\nwww.hotelschool.co.za"
)

NAME_NO_CONTACT_LABEL_BLOCK_2 = (
    "LISOF (Pty) Ltd\nMrs L Wainer\nDeputy Registrar\n(011) 326 1698(T)\n"
    "Website:\nwww.lisof.co.za"
)

NAME_STARTS_WITH_DIGIT_BLOCK = (
    "2 Oceans Graduate Institute\nNPC\nCONTACT PERSON:\nMr JJ van Zyl\n"
    "Registrar and Marketing Strategist\n(021) 829 7015 (T)\n086 661 1926 (F)"
)

ADDRESS_BLOCK_SINGLE = (
    "A) Bryanston: The Braes\nOffice Park, 3 Eaton\nAvenue, Bryanston, 2191"
)

ADDRESS_BLOCK_MULTI = (
    "A) Pretoria: 374 Cliff\nAvenue, Waterkloof Ridge\nX2, Pretoria, 0181."
)

QUALIFICATIONS_BLOCK = (
    "1) Higher Certificate in Digital Marketing (NQF\nlevel 5, 120-Credits: "
    "Distance Mode) [A]\n2) Higher Certificate in Marketing Communication\n"
    "(HEQSF Aligned, NQF Level 5, 120-\nCredits: Contact Mode) [A, B]"
)

QUALIFICATIONS_BLOCK_WITH_PREAMBLE = (
    "The following programmes are registered in\nterms of section 54(3) of "
    "the Higher\nEducation Act until 31 December 2027\n1) Higher Certificate "
    "in Architectural\nTechnology (HEQSF Aligned,\nNQF Level 5, "
    "120-Credits: Contact\nMode) [A, B]\n2) Higher Certificate in Creative "
    "Music\nTechnology [Em] (HEQSF\nAligned, NQF Level 5, 120-\nCredits: "
    "Contact Mode) [D]"
)


def test_extract_name_stops_before_contact_person():
    assert extract_name(NAME_CONTACT_BLOCK_1) == "AAA School of Advertising (Pty) Ltd"


def test_extract_name_joins_wrapped_lines():
    assert extract_name(NAME_CONTACT_BLOCK_2) == "Academy for Facility Management (Pty) Ltd (A4FM)"


def test_extract_name_returns_empty_for_continuation_block():
    assert extract_name(CONTINUATION_BLOCK_NO_NAME) == ""


def test_extract_name_stops_before_plural_contacts_label():
    assert extract_name(NAME_CONTACTS_PLURAL_BLOCK) == "College of Transfiguration NPC"


def test_extract_name_stops_at_salutation_line_with_no_contact_label():
    assert extract_name(NAME_NO_CONTACT_LABEL_BLOCK) == "International Hotel School (Pty) Ltd (The)"
    assert extract_name(NAME_NO_CONTACT_LABEL_BLOCK_2) == "LISOF (Pty) Ltd"


def test_extract_name_keeps_leading_digit_in_institution_name():
    assert extract_name(NAME_STARTS_WITH_DIGIT_BLOCK) == "2 Oceans Graduate Institute NPC"


def test_extract_phones_strips_parens():
    assert extract_phones(NAME_CONTACT_BLOCK_2) == ["012 993 0533"]


def test_extract_phones_handles_spaced_prefix():
    assert extract_phones(CONTINUATION_BLOCK_NO_NAME) == ["031 307 7170"]


def test_extract_phones_empty_when_absent():
    assert extract_phones("no numbers here") == []


def test_extract_website():
    assert extract_website(NAME_CONTACT_BLOCK_2) == "www.a4fm.ac.za"


def test_extract_website_none_when_absent():
    assert extract_website(NAME_CONTACT_BLOCK_1) is None


def test_extract_emails_multiple_dedup_lowercase():
    assert extract_emails(NAME_CONTACT_BLOCK_2) == ["admin@a4fm.ac.za", "jge@a4fm.ac.za"]


def test_extract_emails_single():
    assert extract_emails(CONTINUATION_BLOCK_NO_NAME) == ["mkooblal@richfield.ac.za"]


def test_extract_emails_empty_when_absent():
    assert extract_emails("no email here") == []


def test_clean_address_reflows_wrapped_lines():
    assert clean_address(ADDRESS_BLOCK_SINGLE) == "A) Bryanston: The Braes Office Park, 3 Eaton Avenue, Bryanston, 2191"


def test_clean_address_multi_line():
    assert clean_address(ADDRESS_BLOCK_MULTI) == "A) Pretoria: 374 Cliff Avenue, Waterkloof Ridge X2, Pretoria, 0181."


def test_clean_address_empty_string_for_none():
    assert clean_address(None) == ""


def test_split_qualifications_basic():
    result = split_qualifications(QUALIFICATIONS_BLOCK)
    assert result == [
        "1) Higher Certificate in Digital Marketing (NQF level 5, 120-Credits: Distance Mode) [A]",
        "2) Higher Certificate in Marketing Communication (HEQSF Aligned, NQF Level 5, 120-Credits: Contact Mode) [A, B]",
    ]


def test_split_qualifications_drops_preamble():
    result = split_qualifications(QUALIFICATIONS_BLOCK_WITH_PREAMBLE)
    assert len(result) == 2
    assert result[0].startswith("1) Higher Certificate in Architectural")
    assert "The following programmes" not in result[0]


def test_split_qualifications_empty_for_blank_input():
    assert split_qualifications("") == []
    assert split_qualifications(None) == []


def test_extract_registration_number_found():
    assert extract_registration_number("2000/HE07/015") == "2000/HE07/015"


def test_extract_registration_number_strips_noise():
    assert extract_registration_number(" 2009/HE07/012 \n") == "2009/HE07/012"


def test_extract_registration_number_none_when_missing():
    assert extract_registration_number("") is None
    assert extract_registration_number(None) is None
    assert extract_registration_number("Gauteng") is None


CANCELLATION_NOTICE_BLOCK = (
    "Damelin (Pty) Ltd\nCONTACT PERSON:\nMs R Reddy\n(086) 181 9220 (T)\n"
    "2 Maryvale Road\nWestville\nDurban\n3629\nReasons for cancellation of\n"
    "registration in terms of the\nAct and the Regulations\nceased to meet "
    "the eligibility\ncriteria for registration"
)


def test_has_cancellation_notice_detects_wrapped_phrase():
    assert has_cancellation_notice(CANCELLATION_NOTICE_BLOCK) is True


def test_has_cancellation_notice_false_for_ordinary_block():
    assert has_cancellation_notice(NAME_CONTACT_BLOCK_2) is False


def test_has_cancellation_notice_false_for_blank_input():
    assert has_cancellation_notice("") is False
    assert has_cancellation_notice(None) is False


CANCELLATION_REASON_WITH_DATE_BLOCK = (
    "Camelot International Pty\n(Ltd)\nCONTACT PERSON:\nRosemarie Heesen\n"
    "P O Box 1090\nHOUGHTON\n2121\nReasons for cancellation of\n"
    "registration in terms of the\nAct and the Regulations\nCamelot "
    "International (Pty)\nLtd no longer offers\nprogrammes aligned to the\n"
    "HEQSF.\nDate when cancellation\ncomes into effect\n13 July 2021"
)


def test_extract_cancellation_reason_stops_before_effective_date():
    assert extract_cancellation_reason(CANCELLATION_REASON_WITH_DATE_BLOCK) == (
        "Camelot International (Pty) Ltd no longer offers programmes aligned to the HEQSF."
    )


def test_extract_cancellation_reason_without_trailing_date():
    assert extract_cancellation_reason(CANCELLATION_NOTICE_BLOCK) == (
        "ceased to meet the eligibility criteria for registration"
    )


def test_extract_cancellation_reason_none_when_no_notice():
    assert extract_cancellation_reason(NAME_CONTACT_BLOCK_2) is None


def test_extract_cancellation_reason_none_for_blank_input():
    assert extract_cancellation_reason("") is None
    assert extract_cancellation_reason(None) is None

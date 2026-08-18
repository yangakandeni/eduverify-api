from build import record_to_institution

RECORD_1 = {
    "index": "1.",
    "status": "Registered",
    "name_block": (
        "AAA School of Advertising\n(Pty) Ltd\nCONTACT PERSON:\nDr Muni Kooblal\n"
        "Academic Registrar\n031 307 7170 (F)\nWebsite:\nwww.aaaschool.co.za\n"
        "Email Address:\nmkooblal@richfield.ac.za\nPrivate Bag X23\nUmhlanga Rocks\n4320"
    ),
    "address_block": (
        "A) Bryanston: The Braes\nOffice Park, 3 Eaton\nAvenue, Bryanston, 2191\n"
        "B) Cape Town: 6thFloor,\nAAA House, 112 Long\nStreet, Cape Town, 8001."
    ),
    "registration_number": "2000/HE07/015",
    "province": "Gauteng",
    "qualifications_block": (
        "1) Higher Certificate in Digital Marketing (NQF\nlevel 5, 120-Credits: "
        "Distance Mode) [A]\n2) Higher Certificate in Marketing Communication\n"
        "(HEQSF Aligned, NQF Level 5, 120-\nCredits: Contact Mode) [A, B]"
    ),
}

RECORD_MISSING_EVERYTHING = {
    "index": "99.",
    "status": "Registered",
    "name_block": "",
    "address_block": "",
    "registration_number": "",
    "province": "",
    "qualifications_block": "",
}


def test_record_to_institution_full():
    inst = record_to_institution(RECORD_1)
    assert inst is not None
    assert inst.name == "AAA School of Advertising (Pty) Ltd"
    assert inst.registration_number == "2000/HE07/015"
    assert inst.status == "Registered"
    assert inst.province == "Gauteng"
    assert "A) Bryanston" in inst.address
    assert "B) Cape Town" in inst.address
    assert inst.contacts.email == ["mkooblal@richfield.ac.za"]
    assert inst.contacts.phone == ["031 307 7170"]
    assert inst.contacts.website == "www.aaaschool.co.za"
    assert len(inst.qualifications) == 2


def test_record_to_institution_returns_none_when_name_missing():
    assert record_to_institution(RECORD_MISSING_EVERYTHING) is None


def test_record_to_institution_blank_province_becomes_none():
    record = dict(RECORD_1)
    record["province"] = ""
    inst = record_to_institution(record)
    assert inst.province is None


def test_record_to_institution_blank_registration_number_becomes_none():
    record = dict(RECORD_1)
    record["registration_number"] = "not a reg number"
    inst = record_to_institution(record)
    assert inst.registration_number is None


def test_record_to_institution_overrides_status_to_cancelled_when_name_block_has_cancellation_notice():
    record = dict(RECORD_1)
    record["status"] = "Provisionally Registered"
    record["name_block"] = (
        RECORD_1["name_block"] + "\nReasons for cancellation of\nregistration in terms of the\n"
        "Act and the Regulations\nceased to meet the eligibility criteria"
    )
    inst = record_to_institution(record)
    assert inst.status == "Cancelled"


def test_record_to_institution_keeps_section_status_when_no_cancellation_notice():
    inst = record_to_institution(RECORD_1)
    assert inst.status == "Registered"


def test_record_to_institution_captures_cancellation_reason():
    record = dict(RECORD_1)
    record["status"] = "Cancelled"
    record["name_block"] = (
        RECORD_1["name_block"] + "\nReasons for cancellation of\nregistration in terms of the\n"
        "Act and the Regulations\nno longer offers\nprogrammes aligned to the\nHEQSF.\n"
        "Date when cancellation\ncomes into effect\n13 July 2021"
    )
    inst = record_to_institution(record)
    assert inst.cancellation_reason == "no longer offers programmes aligned to the HEQSF."


def test_record_to_institution_cancellation_reason_none_when_no_notice():
    inst = record_to_institution(RECORD_1)
    assert inst.cancellation_reason is None

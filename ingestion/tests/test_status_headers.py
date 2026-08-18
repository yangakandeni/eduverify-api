from pdf_extract import EXCLUDED, detect_status_header


def test_detects_registered_header():
    assert detect_status_header([None, "1. REGISTERED INSTITUTIONS", None]) == "Registered"


def test_detects_provisionally_registered_header():
    assert detect_status_header([None, "2. PROVISIONALLY REGISTERED INSTITUTIONS", None]) == "Provisionally Registered"


def test_detects_cancelled_institutions_section_as_cancelled():
    row = [
        None,
        "3. THE REGISTRATION OF THE FOLLOWING INSTITUTIONS ARE CANCELLED. THESE INSTITUTIONS MAY LODGE AN",
    ]
    assert detect_status_header(row) == "Cancelled"


def test_detects_cancellation_lapse_section_as_excluded():
    """Section 4 is a numbered name-only list, not a table row schema iter_status_rows can
    yield — its entries are picked up separately by pdf_extract.iter_name_list_entries."""
    row = [None, "4. INSTITUTIONS FOR WHICH CANCELLATION OR LAPSE OF REGISTRATION HAS COME INTO EFFECT", None]
    assert detect_status_header(row) == EXCLUDED


def test_detects_discontinued_by_request_section_as_excluded():
    """Section 5 is also a numbered name-only list — see iter_name_list_entries."""
    row = [None, "5. INSTITUTIONS WHICH HAVE REQUESTED THAT THE REGISTRAR DISCONTINUE THEIR REGISTRATION", None]
    assert detect_status_header(row) == EXCLUDED


def test_detects_bogus_colleges_warning_section_as_bogus():
    row = [None, "6. WARNING: ILLEGAL COLLEGES ALSO KNOWN AS BOGUS COLLEGES", None]
    assert detect_status_header(row) == "Bogus"


def test_ordinary_data_row_has_no_status_header():
    row = ["1.", "AAA School of Advertising", "A) Bryanston", "2000/HE07/015", "Gauteng", "1) Higher Certificate"]
    assert detect_status_header(row) is None


def test_handles_none_cells_without_crashing():
    assert detect_status_header([None, None, None]) is None

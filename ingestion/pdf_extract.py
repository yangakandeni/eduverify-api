"""Read raw table rows out of the DHET register PDF, tagging each with the
registration-status section it falls under."""

import re

import pdfplumber

_REGISTERED_RE = re.compile(r"REGISTERED INSTITUTIONS", re.IGNORECASE)
_PROVISIONAL_RE = re.compile(r"PROVISIONALLY REGISTERED", re.IGNORECASE)

# Section 3 ("...INSTITUTIONS ARE CANCELLED...") uses the same 6-column
# NAME/ADDRESS/REG-NO/PROVINCE/QUALIFICATIONS table schema as sections 1-2,
# so its rows flow through the same `grouping.group_table_rows` pipeline,
# just tagged with a "Cancelled" status instead of carrying forward
# whichever status section 2 last set (the bug this regex fixes).
_CANCELLED_RE = re.compile(r"REGISTRATION OF THE FOLLOWING INSTITUTIONS ARE CANCELLED", re.IGNORECASE)

# Section 6 ("WARNING: ILLEGAL/BOGUS COLLEGES") *is* a real pdfplumber table,
# but its layout is incompatible with the fixed 6-column schema above: the
# leading "N." index is embedded in the NAME cell itself rather than a
# separate column, and the number of columns varies page to page. Its rows
# are grouped separately by `grouping.group_bogus_rows`.
_BOGUS_RE = re.compile(r"BOGUS COLLEGES|ILLEGAL COLLEGES", re.IGNORECASE)

# Sections 4-5 (institutions whose registration lapsed/was cancelled, or
# which requested discontinuation) are numbered plain-text name lists, not
# tables at all — pdfplumber's extract_tables() yields no rows for them.
# Their row-numbering ("1. Some College ...") also wouldn't start a new
# record for `grouping.group_table_rows` if it somehow did. They're excluded
# from this table-row stream and picked up instead by
# `iter_name_list_entries`, which walks each page's plain text.
_EXCLUDED_SECTION_RE = re.compile(
    r"CANCELLATION OR LAPSE OF REGISTRATION|DISCONTINUE THEIR REGISTRATION",
    re.IGNORECASE,
)

EXCLUDED = "Excluded"

# (regex, status) pairs for the name-only list sections, in the order their
# headers appear in the register. Each section's list runs from its header
# up to (but not including) the next header in this sequence.
_NAME_LIST_SECTIONS = [
    (re.compile(r"CANCELLATION OR LAPSE OF REGISTRATION", re.IGNORECASE), "Cancelled"),
    (re.compile(r"DISCONTINUE THEIR REGISTRATION", re.IGNORECASE), "Discontinued"),
    (_BOGUS_RE, None),  # terminates the Discontinued list; section 6 itself is tabular
]

_NAME_LIST_ENTRY_RE = re.compile(r"^\d+\)\s+(.+)$")


def detect_status_header(row):
    """If `row` is a section-header row (e.g. "1. REGISTERED INSTITUTIONS"),
    return the status string it announces; otherwise None."""
    joined = " ".join((cell or "") for cell in row)
    if _CANCELLED_RE.search(joined):
        return "Cancelled"
    if _BOGUS_RE.search(joined):
        return "Bogus"
    if _EXCLUDED_SECTION_RE.search(joined):
        return EXCLUDED
    if _PROVISIONAL_RE.search(joined):
        return "Provisionally Registered"
    if _REGISTERED_RE.search(joined):
        return "Registered"
    return None


def iter_status_rows(pdf_path):
    """Yield (status, row) tuples for every table row across the whole PDF,
    in document order, carrying forward whichever status section header was
    most recently seen. Section-header rows themselves are not yielded, and
    rows under an excluded section are dropped entirely so they can never be
    merged as a "continuation" of a preceding, unrelated institution."""
    status = None
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                for row in table:
                    header_status = detect_status_header(row)
                    if header_status:
                        status = header_status
                        continue
                    if status == EXCLUDED:
                        continue
                    yield status, row


def parse_name_list_lines(lines):
    """Yield (status, name) tuples for institutions listed by name only, in
    sections 4 ("Cancelled") and 5 ("Discontinued") of the register — plain
    numbered paragraphs ("1) Some College ...") rather than a table. `lines`
    is any iterable of plain-text lines in document order (e.g. a page's
    `extract_text()` output, split on newlines)."""
    current_status = None
    for line in lines:
        matched_header = False
        for header_re, status in _NAME_LIST_SECTIONS:
            if header_re.search(line):
                current_status = status
                matched_header = True
                break
        if matched_header or not current_status:
            continue
        match = _NAME_LIST_ENTRY_RE.match(line.strip())
        if match:
            yield current_status, match.group(1).strip()


def _iter_page_text_lines(pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            yield from (page.extract_text() or "").split("\n")


def iter_name_list_entries(pdf_path):
    """Yield (status, name) tuples for every name-list entry across the
    whole PDF (see `parse_name_list_lines`), reading each page's flat text
    instead of `extract_tables()` since these sections aren't real tables.
    Lines are streamed across the whole document (not reset per page) since
    a section's list commonly spans several pages without repeating its
    header on each one."""
    yield from parse_name_list_lines(_iter_page_text_lines(pdf_path))

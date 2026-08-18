"""Merge raw pdfplumber table rows into one dict per institution.

The DHET register table wraps a single institution's data across multiple
physical table rows (and often across a page break) whenever a cell's
content is too long for one row. A new institution starts only when the
leading index column ("1.", "2.", ...) is populated; every other row is a
continuation that must be appended to the most recently started record.
"""

import re

_NEW_RECORD_RE = re.compile(r"^\d+\.$")
_COLUMN_KEYS = [None, "name_block", "address_block", "registration_number", "province", "qualifications_block"]

# Section 6's ("bogus colleges") NAME column repeats "N. Name" with the index
# embedded in the same cell, rather than a separate leading index column.
_BOGUS_NEW_RECORD_RE = re.compile(r"^\d+\.\s+\S")
_BOGUS_NOISE_RE = re.compile(r"^(NAME|PHYSICAL ADDRESS|CONTACT DETAILS)", re.IGNORECASE)


def _cell(value):
    return (value or "").strip()


def _is_noise_row(row):
    if len(row) != 6:
        return True
    if _cell(row[1]).upper() == "NAME":
        return True
    if all(_cell(c) == "" for c in row):
        return True
    return False


def group_table_rows(status_rows):
    """status_rows: iterable of (status, row) tuples, row being the 6-column
    list pdfplumber's extract_tables() returns. Returns a list of dicts, one
    per institution, with keys: index, status, name_block, address_block,
    registration_number, province, qualifications_block."""
    records = []
    current = None
    for status, row in status_rows:
        if _is_noise_row(row):
            continue
        if _NEW_RECORD_RE.match(_cell(row[0])):
            if current:
                records.append(current)
            current = {"index": _cell(row[0]), "status": status}
            for col_idx, key in enumerate(_COLUMN_KEYS):
                if key:
                    current[key] = _cell(row[col_idx])
        else:
            if current is None:
                continue
            for col_idx, key in enumerate(_COLUMN_KEYS):
                if not key:
                    continue
                extra = _cell(row[col_idx])
                if extra:
                    current[key] = f"{current[key]}\n{extra}" if current[key] else extra
    if current:
        records.append(current)
    return records


def group_bogus_rows(status_rows):
    """Group section 6's ("WARNING: ... BOGUS COLLEGES") rows into one
    name-only record per college. Unlike `group_table_rows`, a new entry's
    "N." index is embedded in the same NAME cell rather than a separate
    column, and the column count varies row to row, so only column 0 (the
    name) is tracked here — the address/contact/programme columns aren't
    needed for a warning list and their layout isn't consistent enough to
    parse reliably.

    status_rows: iterable of (status, row) tuples, as yielded by
    `pdf_extract.iter_status_rows`; rows not tagged "Bogus" are ignored."""
    records = []
    current_name = None
    for status, row in status_rows:
        if status != "Bogus":
            continue
        col0 = _cell(row[0]) if row else ""
        if not col0 or _BOGUS_NOISE_RE.match(col0):
            continue
        if _BOGUS_NEW_RECORD_RE.match(col0):
            if current_name:
                records.append({"status": "Bogus", "name_block": current_name})
            current_name = re.sub(r"^\d+\.\s+", "", col0).replace("\n", " ").strip()
        elif current_name is not None:
            # A bare single-cell row here is an orphaned overflow fragment from a
            # different (already-closed) entry's address/contact column — pdfplumber
            # sometimes splits one logical table into several table objects when a
            # cell's text is long, so the tail reappears later in the row stream with
            # no column/entity information left. A legitimate name continuation always
            # keeps the full multi-column row shape, so this can't misfire on one.
            if len(row) == 1:
                continue
            current_name = current_name + " " + col0.replace("\n", " ").strip()
    if current_name:
        records.append({"status": "Bogus", "name_block": current_name})
    return records

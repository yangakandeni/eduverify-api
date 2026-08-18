"""Convert a grouped raw record (from grouping.group_table_rows) into a
validated Institution model, applying the field-level extraction helpers."""

from extraction import (
    clean_address,
    extract_cancellation_reason,
    extract_emails,
    extract_name,
    extract_phones,
    extract_registration_number,
    extract_website,
    has_cancellation_notice,
    split_qualifications,
)
from grouping import group_bogus_rows, group_table_rows
from models import Contacts, Institution
from pdf_extract import iter_name_list_entries, iter_status_rows

# Statuses whose rows share the 6-column NAME/ADDRESS/REG-NO/PROVINCE/
# QUALIFICATIONS table schema (sections 1-3) and so flow through
# `grouping.group_table_rows`; "Bogus" (section 6) uses a different, embedded
# -index schema and is grouped separately by `grouping.group_bogus_rows`.
_TABULAR_STATUSES = {"Registered", "Provisionally Registered", "Cancelled"}

# A name-only entry (sections 4-6) has no address/registration-number/
# qualifications data, but `record_to_institution` only requires a name, so
# these keys are left blank rather than needing a separate code path.
_BLANK_RECORD_FIELDS = {
    "address_block": "",
    "registration_number": "",
    "province": "",
    "qualifications_block": "",
}


def build_institutions(pdf_path):
    """Parse every institution out of the register PDF: the actively
    registered/provisional/cancelled institutions (tabular sections 1-3),
    plus the name-only cancelled/discontinued lists (sections 4-5) and the
    "bogus colleges" warning table (section 6). Returns a flat list of
    Institution models — callers that need per-status stats can group by
    `.status` themselves."""
    status_rows = list(iter_status_rows(pdf_path))
    tabular_rows = [(status, row) for status, row in status_rows if status in _TABULAR_STATUSES]

    records = group_table_rows(tabular_rows)
    records += group_bogus_rows(status_rows)
    records += [
        {"status": status, "name_block": name, **_BLANK_RECORD_FIELDS}
        for status, name in iter_name_list_entries(pdf_path)
    ]

    institutions = []
    for record in records:
        institution = record_to_institution(record)
        if institution is not None:
            institutions.append(institution)
    return institutions


def record_to_institution(record):
    """Returns an Institution, or None if the record has no parseable name
    (e.g. a malformed/irregular row that shouldn't crash the pipeline)."""
    name = extract_name(record.get("name_block", ""))
    if not name:
        return None

    name_block = record.get("name_block", "")
    province = record.get("province", "").strip() or None
    status = "Cancelled" if has_cancellation_notice(name_block) else record.get("status")

    return Institution(
        name=name,
        registration_number=extract_registration_number(record.get("registration_number", "")),
        status=status,
        address=clean_address(record.get("address_block", "")),
        province=province,
        contacts=Contacts(
            email=extract_emails(name_block),
            phone=extract_phones(name_block),
            website=extract_website(name_block),
        ),
        qualifications=split_qualifications(record.get("qualifications_block", "")),
        cancellation_reason=extract_cancellation_reason(name_block),
    )

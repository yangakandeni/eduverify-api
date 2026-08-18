"""Pure text-parsing helpers for fields inside a single DHET register table cell.

These operate on the raw multi-line strings pdfplumber returns for a table
cell, and are deliberately side-effect free so they can be unit tested without
a PDF or network access.
"""

import re

_STOP_LINE_PATTERNS = [
    re.compile(r"^CONTACT\s*(PERSON|DETAILS)", re.IGNORECASE),
    re.compile(r"^CONTACTS?\s*:", re.IGNORECASE),
    re.compile(r"website", re.IGNORECASE),
    re.compile(r"e-?mail", re.IGNORECASE),
    re.compile(r"^\(?0\d{1,2}\)?[\s\-]?\d{3}[\s\-]?\d{4}"),  # phone/fax numbers
    # A contact person's name, on rows where the PDF omits the "CONTACT
    # PERSON:" label altogether (e.g. "LISOF (Pty) Ltd" / "Mrs L Wainer" /
    # "Deputy Registrar" with no label line between the name and the person).
    re.compile(r"^(Mr|Mrs|Ms|Dr|Prof)\.?\s+[A-Z]"),
]

_PHONE_RE = re.compile(r"\(?0\d{1,2}\)?[\s\-]?\d{3}[\s\-]?\d{4}")
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_WEBSITE_RE = re.compile(r"https?://\S+|www\.\S+", re.IGNORECASE)
_REG_NO_RE = re.compile(r"\d{4}/HE\d{2}/\d+")
_CANCELLATION_NOTICE_RE = re.compile(r"reasons\s+for\s+cancellation\s+of\s+registration", re.IGNORECASE)
_CANCELLATION_REASON_LABEL_RE = re.compile(
    r"reasons\s+for\s+cancellation\s+of\s+registration\s+in\s+terms\s+of\s+the\s+act\s+and\s+the\s+regulations",
    re.IGNORECASE,
)
_CANCELLATION_DATE_LABEL_RE = re.compile(r"date\s+when\s+cancellation\s+comes\s+into\s+effect", re.IGNORECASE)
_QUALIFICATION_SPLIT_RE = re.compile(r"\n(?=\d+\)\s)")
_QUALIFICATION_START_RE = re.compile(r"^\d+\)\s")


def extract_name(name_block):
    """Return the institution name, stripped from a NAME/contact table cell.

    Continuation cells (where a row's first column was blank) carry no name
    and start straight into contact/address details, in which case this
    returns "".
    """
    if not name_block:
        return ""
    lines = name_block.split("\n")
    name_lines = []
    for line in lines:
        if any(p.search(line) for p in _STOP_LINE_PATTERNS):
            break
        name_lines.append(line.strip())
    return " ".join(l for l in name_lines if l).strip()


def extract_phones(text):
    if not text:
        return []
    seen = []
    for match in _PHONE_RE.findall(text):
        normalized = re.sub(r"\s+", " ", match.strip()).replace("(", "").replace(")", "")
        if normalized not in seen:
            seen.append(normalized)
    return seen


def extract_emails(text):
    if not text:
        return []
    seen = []
    for match in _EMAIL_RE.findall(text):
        normalized = match.lower()
        if normalized not in seen:
            seen.append(normalized)
    return seen


def extract_website(text):
    if not text:
        return None
    match = _WEBSITE_RE.search(text)
    if not match:
        return None
    return match.group(0).strip().rstrip(".,;)")


def _reflow(lines):
    """Join wrapped lines into one string, honoring PDF mid-word hyphen wraps
    (e.g. "120-" / "Credits" -> "120-Credits", not "120- Credits")."""
    result = ""
    for line in lines:
        if result and not result.endswith("-"):
            result += " "
        result += line
    return result


def clean_address(address_block):
    """Reflow a wrapped, multi-line address cell into a single-line string."""
    if not address_block:
        return ""
    lines = [l.strip() for l in address_block.split("\n") if l.strip()]
    return _reflow(lines)


def split_qualifications(qualifications_block):
    """Split a QUALIFICATIONS cell into a list of individual qualification
    strings, discarding any preamble text before the first numbered item."""
    if not qualifications_block:
        return []
    chunks = _QUALIFICATION_SPLIT_RE.split(qualifications_block)
    items = []
    for chunk in chunks:
        if not _QUALIFICATION_START_RE.match(chunk.strip()):
            continue
        lines = [l.strip() for l in chunk.split("\n") if l.strip()]
        items.append(_reflow(lines))
    return items


def extract_registration_number(text):
    if not text:
        return None
    match = _REG_NO_RE.search(text)
    if not match:
        return None
    return match.group(0)


def extract_cancellation_reason(name_block):
    """Return the free-text reason DHET gives for a cancellation, pulled from the
    NAME/contact cell text following the "Reasons for cancellation of registration
    in terms of the Act and the Regulations" label, and stopping before the "Date
    when cancellation comes into effect" label (or end of cell) so the effective
    date/phase-out sentence that follows isn't included. None if the cell carries
    no cancellation notice at all."""
    if not name_block:
        return None
    label_match = _CANCELLATION_REASON_LABEL_RE.search(name_block)
    if not label_match:
        return None
    remainder = name_block[label_match.end():]
    date_match = _CANCELLATION_DATE_LABEL_RE.search(remainder)
    if date_match:
        remainder = remainder[: date_match.start()]
    lines = [l.strip() for l in remainder.split("\n") if l.strip()]
    return _reflow(lines) or None


def has_cancellation_notice(name_block):
    """True if a NAME/contact cell carries DHET's "Reasons for cancellation of
    registration..." notice. The register lists these institutions under the
    Registered/Provisionally Registered sections (not the excluded lapse/
    cancellation sections pdf_extract drops), so this is the only signal that
    a registration is actually cancelled rather than still active."""
    if not name_block:
        return False
    return bool(_CANCELLATION_NOTICE_RE.search(name_block))

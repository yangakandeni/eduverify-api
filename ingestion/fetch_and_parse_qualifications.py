"""Download the SAQA NLRD "All Qualifications and Part-Qualifications" register
and parse it into structured JSON at /data/qualifications.json.

Usage:
    python fetch_and_parse_qualifications.py                    # download the latest register
    python fetch_and_parse_qualifications.py --xlsx-path FILE   # parse an already-downloaded file
"""

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urljoin

import requests

from qualifications_extract import build_qualifications

SAQA_NLRD_PAGE_URL = "https://saqa.org.za/services/nqf-mis-incorporating-the-nlrd/"

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
OUTPUT_PATH = DATA_DIR / "qualifications.json"
DOWNLOAD_PATH = DATA_DIR / "_saqa_all_qualifications.xlsx"

_XLSX_LINK_RE = re.compile(r'href="([^"]+\.xlsx)"[^>]*>([^<]*)</a>', re.IGNORECASE)


def extract_xlsx_link(html):
    """Best-effort scrape of the SAQA NLRD Documents section for the current
    "All Qualifications and Part-Qualifications" xlsx link. SAQA doesn't
    publish a stable direct URL (the DHET register has the same problem —
    its PDF URL in fetch_and_parse.py is hardcoded and needs periodic manual
    updates), so this may need adjusting if SAQA changes their page markup."""
    for href, text in _XLSX_LINK_RE.findall(html):
        if "qualification" in href.lower() or "qualification" in text.lower():
            return href
    return None


def download_xlsx(dest_path, timeout=60):
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    page = requests.get(SAQA_NLRD_PAGE_URL, timeout=timeout)
    page.raise_for_status()

    link = extract_xlsx_link(page.text)
    if not link:
        raise RuntimeError(
            f"Could not find an 'All Qualifications' xlsx link on {SAQA_NLRD_PAGE_URL} "
            "— the page markup may have changed."
        )

    file_url = urljoin(SAQA_NLRD_PAGE_URL, link)
    response = requests.get(file_url, timeout=timeout)
    response.raise_for_status()
    dest_path.write_bytes(response.content)
    return dest_path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--xlsx-path", type=Path, default=None, help="Parse a local xlsx instead of downloading")
    args = parser.parse_args()

    if args.xlsx_path:
        xlsx_path = args.xlsx_path
        if not xlsx_path.exists():
            print(f"Error: {xlsx_path} does not exist", file=sys.stderr)
            return 1
    else:
        print(f"Downloading the SAQA qualifications register from {SAQA_NLRD_PAGE_URL} ...")
        try:
            xlsx_path = download_xlsx(DOWNLOAD_PATH)
        except (requests.RequestException, RuntimeError) as exc:
            print(f"Error: failed to download the SAQA register: {exc}", file=sys.stderr)
            return 1
        print(f"Downloaded to {xlsx_path}")

    print("Parsing xlsx (all NQF sub-frameworks)...")
    qualifications = build_qualifications(xlsx_path)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps([q.model_dump() for q in qualifications], indent=2, ensure_ascii=False)
    )

    print()
    print("=== Summary ===")
    print(f"Qualifications parsed : {len(qualifications)}")
    print(f"Output written to: {OUTPUT_PATH}")

    if qualifications:
        print()
        print("=== Sample record ===")
        print(json.dumps(qualifications[0].model_dump(), indent=2, ensure_ascii=False))

    return 0


if __name__ == "__main__":
    sys.exit(main())

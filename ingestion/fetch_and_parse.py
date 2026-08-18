"""Download the DHET Annexure A register (Private Higher Education
Institutions) and parse it into structured JSON at /data/institutions.json.

Usage:
    python fetch_and_parse.py                  # download the latest register
    python fetch_and_parse.py --pdf-path FILE   # parse an already-downloaded PDF
"""

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import requests

from build import build_institutions

DHET_PDF_URL = (
    "https://www.dhet.gov.za/Registers_DocLib/Annexure%20A%20Register%20"
    "%20Private%20Higher%20Education%20Institutions%2006%20July%202026.pdf"
)

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
OUTPUT_PATH = DATA_DIR / "institutions.json"
DOWNLOAD_PATH = DATA_DIR / "_annexure_a_register.pdf"


def download_pdf(url, dest_path, timeout=60):
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    response = requests.get(url, timeout=timeout)
    response.raise_for_status()
    dest_path.write_bytes(response.content)
    return dest_path


def parse_pdf(pdf_path):
    """Returns (institutions: list[Institution], stats: dict)."""
    institutions = build_institutions(pdf_path)
    stats = {
        "total_parsed": len(institutions),
        "by_status": dict(Counter(i.status or "Unknown" for i in institutions)),
    }
    return institutions, stats


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf-path", type=Path, default=None, help="Parse a local PDF instead of downloading")
    args = parser.parse_args()

    if args.pdf_path:
        pdf_path = args.pdf_path
        if not pdf_path.exists():
            print(f"Error: {pdf_path} does not exist", file=sys.stderr)
            return 1
    else:
        print(f"Downloading {DHET_PDF_URL} ...")
        try:
            pdf_path = download_pdf(DHET_PDF_URL, DOWNLOAD_PATH)
        except requests.RequestException as exc:
            print(f"Error: failed to download the register PDF: {exc}", file=sys.stderr)
            return 1
        print(f"Downloaded to {pdf_path}")

    print("Parsing PDF (this walks every page's tables, may take ~15-20s)...")
    institutions, stats = parse_pdf(pdf_path)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps([i.model_dump() for i in institutions], indent=2, ensure_ascii=False))

    print()
    print("=== Summary ===")
    print(f"Institutions parsed : {stats['total_parsed']}")
    print("By status:")
    for status, count in stats["by_status"].items():
        print(f"  {status}: {count}")
    print(f"Output written to: {OUTPUT_PATH}")

    if institutions:
        print()
        print("=== Sample record ===")
        print(json.dumps(institutions[0].model_dump(), indent=2, ensure_ascii=False))

    return 0


if __name__ == "__main__":
    sys.exit(main())

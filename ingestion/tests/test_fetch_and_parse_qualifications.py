from fetch_and_parse_qualifications import extract_xlsx_link

NLRD_DOCUMENTS_SNIPPET = """
<div class="nlrd-documents">
  <h3>NLRD Documents</h3>
  <ul>
    <li><a href="/wp-content/uploads/2026/01/Learning-Programmes.xlsx">Learning Programmes</a></li>
    <li><a href="/wp-content/uploads/2026/01/All-Qualifications-and-Part-Qualifications-as-at-2026-01-05.xlsx">All Qualifications and Part-Qualifications</a></li>
    <li><a href="/wp-content/uploads/2026/01/Providers.xlsx">Registered Providers</a></li>
  </ul>
</div>
"""


def test_extract_xlsx_link_finds_all_qualifications_file():
    link = extract_xlsx_link(NLRD_DOCUMENTS_SNIPPET)
    assert link == "/wp-content/uploads/2026/01/All-Qualifications-and-Part-Qualifications-as-at-2026-01-05.xlsx"


def test_extract_xlsx_link_returns_none_when_no_match():
    assert extract_xlsx_link("<html><body>no links here</body></html>") is None

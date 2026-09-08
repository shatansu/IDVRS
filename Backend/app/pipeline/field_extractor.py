"""
Phase 3 — Field Extraction Engine
===================================
Converts raw extracted text (from Phase 2 pipeline) into the hierarchical
structured data defined in PRD Section 8.4:
    {
        "khata": { field: { value, confidence }, ... },
        "owners": [ { field: { value, confidence }, ... }, ... ],
        "parcels": [ { field: { value, confidence }, ... }, ... ]
    }

All regex patterns are derived directly from real PyMuPDF output of the
two certified sample documents:
  - CertifiedCopy_Bhu-AdhikarPustika_25030879728.pdf  (Form 4)
  - CertifiedCopy_Khatoni(B1)Copy_25030868731.pdf     (Form 7)

The text layout differs between these two document types and is handled
by document-type-specific parsing strategies that share the same output shape.
"""

import re
import logging
from typing import Optional

logger = logging.getLogger("app.pipeline.field_extractor")

# ---------------------------------------------------------------------------
# Confidence constants
# ---------------------------------------------------------------------------
# High confidence: field matched a clearly labelled pattern (e.g. "जिला : पन्ना")
CONF_LABELED_MATCH = 0.94
# Medium: field matched but label was split across lines or partially broken
CONF_PARTIAL_LABEL = 0.82
# Row-parsed: inferred from positional row parsing in the parcel/owner table
CONF_ROW_PARSED = 0.78
# Fallback: only one candidate found via heuristic, not a clean label match
CONF_HEURISTIC = 0.65
# Not found
CONF_MISSING = 0.0


def _field(value, confidence: float) -> dict:
    """Wrap a value with its confidence score."""
    return {"value": value, "confidence": round(confidence, 2)}


def _missing() -> dict:
    return {"value": None, "confidence": CONF_MISSING}


# ---------------------------------------------------------------------------
# Helper: normalize Devanagari text for matching
# ---------------------------------------------------------------------------
_ZWSP_AND_EXTRAS = re.compile(r"[\u200b\u200c\u200d\ufeff]+")
_MULTI_SPACE = re.compile(r"[ \t]+")
_DOUBLED_MATRAS = re.compile(r"([\u0901-\u0903\u093E-\u094D])\1+")
_OCR_DECIMAL_COLON = re.compile(r"\b0:(\d+)\b")

def _norm(text: str) -> str:
    """Strip zero-width chars, collapse spaces, deduplicate font-glitched Devanagari matras, and fix OCR decimal colons."""
    text = _ZWSP_AND_EXTRAS.sub("", text)
    text = _MULTI_SPACE.sub(" ", text)
    text = _DOUBLED_MATRAS.sub(r"\1", text)
    text = _OCR_DECIMAL_COLON.sub(r"0.\1", text)
    return text.strip()


# ---------------------------------------------------------------------------
# Labeled field extractor (handles "Label\n: Value" and "Label: Value" forms)
# ---------------------------------------------------------------------------

def _extract_labeled(text: str, *patterns: str, conf=CONF_LABELED_MATCH) -> dict:
    """
    Try multiple regex patterns against the full text.
    Returns the first match found, wrapped with confidence.

    Patterns should capture the value in group 1.
    IMPORTANT: patterns must use [^\n]+ (not .+) to prevent greedy multiline
    capture from swallowing the entire document text.

    Real document quirks handled:
      - "CLRM No\n: 25030879728"  — colon on next line after label
      - "CLRM No. : 25030868731" — colon same line, with period
      - "जिला\n: पन्ना"          — Bhu-Adhikar style (label, newline, colon, value)
      - "िला: पन्नाा"            — Khatoni B1 broken rendering of "जिला"
      - "ग्रााम: सिमरिया"        — Khatoni B1 inline label (extra matra ा)
    """
    for pattern in patterns:
        # Use MULTILINE but NOT DOTALL — this prevents .+ from crossing newlines
        m = re.search(pattern, text, re.MULTILINE)
        if m:
            value = _norm(m.group(1)).strip(": ").strip()
            if value:
                return _field(value, conf)
    return _missing()


# ---------------------------------------------------------------------------
# Parcel block parser (Form 4 — Bhu-Adhikar Pustika)
# ---------------------------------------------------------------------------
# In Bhu-Adhikar text, each parcel appears as consecutive lines:
#   <numeric_id>          e.g. "1110820173"
#   <alphanumeric_id>     e.g. "828R0YDCS4MUH0"
#   <survey_number>       e.g. "96/1 (S)"  or  "100 (S)"
#   <area>                e.g. "0.1070 हेक्टेयर"
#   <land_use>            e.g. "कृषि"
#   <revenue>             e.g. "रु.0.30"
# The block repeats for each parcel; column headers appear before the first block.

_NUMERIC_ID_RE = re.compile(r"^\d{10}$")
_ALPHANUM_ID_RE = re.compile(r"^[A-Z0-9]{14}$")
_SURVEY_NO_RE = re.compile(r"^(\d+(?:/\d+)?\s*\([SP]\))$")
_AREA_RE = re.compile(r"^(\d+\.\d+)\s*हेक्टे?यर?")
_REVENUE_BHU_RE = re.compile(r"^रु\.(\d+\.\d+)$")


def _parse_parcels_bhu_adhikar(lines: list[str]) -> list[dict]:
    """
    Scans cleaned lines from Bhu-Adhikar page 2 for parcel data blocks.
    Returns list of parcel dicts matching PRD Section 8.3 structure.
    """
    parcels = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()

        # Look for the numeric parcel unique ID anchor
        if _NUMERIC_ID_RE.match(line) and i + 5 < len(lines):
            numeric_id = line
            alphanum_id = lines[i + 1].strip() if i + 1 < len(lines) else ""
            survey_raw = lines[i + 2].strip() if i + 2 < len(lines) else ""
            area_raw = lines[i + 3].strip() if i + 3 < len(lines) else ""
            land_use_raw = lines[i + 4].strip() if i + 4 < len(lines) else ""
            revenue_raw = lines[i + 5].strip() if i + 5 < len(lines) else ""

            # Validate pattern before accepting
            survey_m = _SURVEY_NO_RE.match(survey_raw)
            area_m = _AREA_RE.match(area_raw)
            rev_m = _REVENUE_BHU_RE.match(revenue_raw)

            if survey_m and area_m:
                # Determine land use flag from survey number suffix
                flag_m = re.search(r"\(([SP])\)", survey_raw)
                land_use_flag = flag_m.group(1) if flag_m else None

                # Combine parcel unique ID
                parcel_uid = f"{numeric_id} / {alphanum_id}" if _ALPHANUM_ID_RE.match(alphanum_id) else numeric_id

                parcel = {
                    "parcel_unique_id": _field(parcel_uid, CONF_ROW_PARSED),
                    "survey_number": _field(survey_m.group(1), CONF_ROW_PARSED),
                    "land_use_flag": _field(land_use_flag, CONF_ROW_PARSED),
                    "area_hectare": _field(float(area_m.group(1)), CONF_ROW_PARSED),
                    "land_use": _field(land_use_raw if land_use_raw else None, CONF_ROW_PARSED),
                    "land_revenue_rs": _field(
                        float(rev_m.group(1)) if rev_m else None,
                        CONF_ROW_PARSED if rev_m else CONF_HEURISTIC
                    ),
                }
                parcels.append(parcel)
                i += 6
                continue
        i += 1
    return parcels


# ---------------------------------------------------------------------------
# Parcel block parser (Form 7 — Khatoni B-1)
# ---------------------------------------------------------------------------
# In Khatoni B1, parcels appear as 4-line groups (no numeric unique ID):
#   <survey_number>    e.g. "96/1 (S)"
#   <area>             e.g. "0.1070 हेक्टेयर"   (note: extra matra ेे in real text)
#   <land_use>         e.g. "कृषि"
#   <revenue>          e.g. "0.30"  (no "रु." prefix in Khatoni B1)
# Followed by totals block ("कुल क्षेे. ...") which signals end of parcel section.

_REVENUE_KHATONI_RE = re.compile(r"^(\d+\.\d+)$")
_AREA_KHATONI_RE = re.compile(r"^(\d+\.\d+)\s*हेक्टे?े?यर?")
_TOTAL_SIGNAL_RE = re.compile(r"कुल\s*(क्षे|संख्या|भू-राजस्व)")


def _parse_parcels_khatoni_b1(lines: list[str]) -> list[dict]:
    """
    Scans cleaned lines from Khatoni B1 text for parcel data blocks.
    Stops at the totals section.
    """
    parcels = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()

        # Stop at totals section
        if _TOTAL_SIGNAL_RE.search(line):
            break

        survey_m = _SURVEY_NO_RE.match(line)
        if survey_m and i + 3 < len(lines):
            area_raw = lines[i + 1].strip()
            land_use_raw = lines[i + 2].strip()
            revenue_raw = lines[i + 3].strip()

            area_m = _AREA_KHATONI_RE.match(area_raw)
            rev_m = _REVENUE_KHATONI_RE.match(revenue_raw)

            if area_m:
                flag_m = re.search(r"\(([SP])\)", line)
                land_use_flag = flag_m.group(1) if flag_m else None

                parcel = {
                    "parcel_unique_id": _missing(),  # Khatoni B1 doesn't show unique IDs in this text layer
                    "survey_number": _field(survey_m.group(1), CONF_ROW_PARSED),
                    "land_use_flag": _field(land_use_flag, CONF_ROW_PARSED),
                    "area_hectare": _field(float(area_m.group(1)), CONF_ROW_PARSED),
                    "land_use": _field(land_use_raw if land_use_raw else None, CONF_ROW_PARSED),
                    "land_revenue_rs": _field(
                        float(rev_m.group(1)) if rev_m else None,
                        CONF_ROW_PARSED if rev_m else CONF_HEURISTIC
                    ),
                }
                parcels.append(parcel)
                i += 4
                continue
        i += 1
    return parcels


# ---------------------------------------------------------------------------
# Owner block parser (shared logic for both document types)
# ---------------------------------------------------------------------------
# Owner blocks in both forms follow this 4-line pattern:
#   Line A: "<owner_name> पुत्र/पुत्री <parent_name>"  (may continue on next line)
#   Line B: "पता <address>" (may span 2 lines e.g. "सिमरिया सिमरिया पन्ना मध्य\nप्रदेश")
#   Line C: "भूमि स्वामी"
#   Line D: "1/3" or "1/3 भाग"  (Khatoni B1 appends "भाग")
#
# Complication: owner names can wrap to the next line ("राजकुमार सेन पुत्र लखन लाल\nसेन")
# Strategy: find lines containing "पुत्र" or "पुत्री" (son/daughter relationship markers)
# then look forward for पता, ownership_status, and share fraction.

_RELATION_RE = re.compile(r"(पुत्र(?:ी)?|माता|पति|पत्नी|बेवा|पिता)\s+(.+)")
_NAME_WITH_RELATION_RE = re.compile(
    r"^(.+?)\s+(पुत्र(?:ी)?|माता|पति|पत्नी|बेवा|पिता)\s+(.+?)$"
)
_SHARE_RE = re.compile(r"^(\d+/\d+)(?:\s+भाग)?$")
_OWNERSHIP_STATUS_RE = re.compile(r"भूमि\s*स्वामी|भूदानधारी|सेवा\s*खातेदार|शासकीय\s*पट्टेदार|खातेदार|वारिसदार")
_PADA_RE = re.compile(r"^पता\s+(.+)")


# Column header lines in both document types contain पिता/पति/माता but are NOT owner entries
# We guard against these by checking that a candidate "owner" line is NOT a table header phrase
_COLUMN_HEADER_PHRASES = (
    "भूमिस्वामी का नाम",
    "खातेदार",
    "निवास का पता",
    "का नाम तथा",
    "माता /",
    "पिता /पति",
)


def _is_column_header(line: str) -> bool:
    """Returns True if this line is a column header rather than an actual owner entry."""
    return any(phrase in line for phrase in _COLUMN_HEADER_PHRASES)


def _parse_owners(lines: list[str]) -> list[dict]:
    """
    Scans text lines for owner blocks.
    Handles multi-line name and address wrapping seen in the real documents.
    """
    owners = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()

        # Skip column header lines that contain relation keywords but are not owner entries
        if _is_column_header(line):
            i += 1
            continue

        # Anchor: a line containing "पुत्र" or "पुत्री" with a name before it
        name_rel_m = _NAME_WITH_RELATION_RE.match(line)
        if name_rel_m:
            owner_name_part = _norm(name_rel_m.group(1))
            relation = name_rel_m.group(2)
            parent_part = _norm(name_rel_m.group(3))

            # Check if the next line is a continuation of the parent name
            # (e.g. "राजकुमार सेन पुत्र लखन लाल\nसेन" — "सेन" on next line)
            j = i + 1
            if j < len(lines):
                next_line = lines[j].strip()
                # Next line is a name continuation if it's short, has no digits,
                # doesn't start with "पता", and doesn't contain relation keywords
                is_name_continuation = (
                    len(next_line) <= 20
                    and not re.search(r"\d", next_line)
                    and not next_line.startswith("पता")
                    and not _OWNERSHIP_STATUS_RE.search(next_line)
                    and not _SHARE_RE.match(next_line)
                    and not _PADA_RE.match(next_line)
                    and not _NAME_WITH_RELATION_RE.match(next_line)
                    and next_line  # not blank
                )
                if is_name_continuation:
                    parent_part = f"{parent_part} {next_line}"
                    j += 1

            # Now look ahead for "पता", ownership_status, share
            address = None
            ownership_status = None
            share_fraction = None

            while j < len(lines) and j < i + 9:
                ahead = lines[j].strip()

                # Address line
                pata_m = _PADA_RE.match(ahead)
                if pata_m and address is None:
                    addr_val = _norm(pata_m.group(1))
                    # Address may spill to next line (e.g. "सिमरिया ... मध्य\nप्रदेश")
                    if j + 1 < len(lines):
                        next_ahead = lines[j + 1].strip()
                        if next_ahead in ("प्रदेश",) or (
                            len(next_ahead) <= 15
                            and not _OWNERSHIP_STATUS_RE.search(next_ahead)
                            and not _SHARE_RE.match(next_ahead)
                        ):
                            addr_val = f"{addr_val} {next_ahead}"
                            j += 1
                    address = addr_val
                    j += 1
                    continue

                # Share fraction line (Khatoni B1: share appears as "1/3 भाग" BEFORE ownership)
                share_m = _SHARE_RE.match(ahead)
                if share_m and share_fraction is None:
                    share_fraction = share_m.group(1)
                    j += 1
                    # In Khatoni B1, ownership_status follows the share line
                    if j < len(lines) and _OWNERSHIP_STATUS_RE.search(lines[j].strip()):
                        ownership_status = _norm(lines[j].strip())
                        j += 1
                    break  # share (and optional status) is the last element

                # Ownership status line (Bhu-Adhikar: status appears BEFORE share)
                if _OWNERSHIP_STATUS_RE.search(ahead) and ownership_status is None:
                    ownership_status = _norm(ahead)
                    j += 1
                    # In Bhu-Adhikar, share follows ownership_status
                    if j < len(lines):
                        s_m = _SHARE_RE.match(lines[j].strip())
                        if s_m:
                            share_fraction = s_m.group(1)
                            j += 1
                    break

                # Stop if we hit another name-with-relation (next owner)
                if _NAME_WITH_RELATION_RE.match(ahead):
                    break

                j += 1

            # Record owner if name + relation was found, along with share, status, or parent name
            if owner_name_part and (share_fraction or ownership_status or parent_part):
                owner = {
                    "owner_name": _field(owner_name_part, CONF_ROW_PARSED),
                    "parent_or_spouse_name": _field(parent_part if parent_part else None, CONF_ROW_PARSED if parent_part else CONF_MISSING),
                    "address": _field(address, CONF_ROW_PARSED if address else CONF_MISSING),
                    "share_fraction": _field(share_fraction, CONF_ROW_PARSED if share_fraction else CONF_MISSING),
                    "ownership_status": _field(ownership_status if ownership_status else "खातेदार", CONF_ROW_PARSED if ownership_status else CONF_HEURISTIC),
                }
                owners.append(owner)
                i = j
                continue

        # Fallback: Parenthesized relation e.g. "तुलसा बाई (पत्नी)" or "राधा बाई (पुत्री)"
        paren_m = re.match(r"^(?:[१-९\d]+[\.\)\-]?\s*)?([^\d\n\(\)]+?)\s*\((पत्नी|पुत्री|पुत्र|माता|पति)\)", line)
        if paren_m:
            o_name = _norm(paren_m.group(1)).strip("- ")
            if o_name and len(o_name) >= 3 and not _is_column_header(o_name):
                owners.append({
                    "owner_name": _field(o_name, CONF_ROW_PARSED),
                    "parent_or_spouse_name": _missing(),
                    "address": _missing(),
                    "share_fraction": _missing(),
                    "ownership_status": _field("खातेदार", CONF_HEURISTIC),
                })
                i += 1
                continue

        i += 1

    return owners


# ---------------------------------------------------------------------------
# Khata-level field extractors
# ---------------------------------------------------------------------------

def _extract_clrm_no(text: str) -> dict:
    res = _extract_labeled(
        text,
        # Bhu-Adhikar: "CLRM No\n: 25030879728" — colon is on next line
        r"CLRM\s*No\.?\s*\n\s*:\s*([^\n]+)",
        # Khatoni B1: "CLRM No. : 25030868731" — colon on same line
        r"CLRM\s*No\.?\s*:\s*([^\n]+)",
        # Mutation register / certified copy dispatch / case numbers e.g. "D 426/0718/2662/2024"
        r"\b([A-Z]\s*\d{3,4}[/|]\d{3,4}[/|]\d{3,4}[/|]\d{4})\b",
        r"\b([A-Z]?[|/]?\d{2,4}[/|]\d{2,4}[/|]\d{2,4}[/|]\d{4})\b",
        conf=CONF_LABELED_MATCH,
    )
    if res["value"] is not None:
        return res
    # Fallback: scan for case / dispatch numbers with OCR artifacts
    m = re.search(r"([A-Za-z0-9]{1,3}[|/`~]\d{2,4}[|/`~]\d{2,4}[|/`~]\d{4})", text)
    if m:
        cleaned = re.sub(r"[`~|]", "/", m.group(1)).replace(" ", "")
        return _field(cleaned, CONF_HEURISTIC)
    return _missing()


def _extract_village(text: str) -> dict:
    res = _extract_labeled(
        text,
        # Bhu-Adhikar: "ग्राम / नगर का नाम\n: सिमरिया"  — value on next line after colon
        r"ग्राम\s*/\s*नगर\s*का\s*नाम\s*\n\s*:\s*([^\n]+)",
        # Khatoni B1: "ग्रााम: सिमरिया"  (extra matra ा in real text)
        r"ग्रा+म\s*:\s*([^\n]+)",
        # Handwritten / OCR: "ग्राम-सिमरिया", "ग्राम सिमरिया"
        r"ग्रा+म\s*[-=:\s]\s*([^\s\n]+(?:\s+[^\s\n]+)?)(?:\s+में\s+स्थित)?",
        conf=CONF_LABELED_MATCH,
    )
    if res["value"] is not None:
        return res
    if "सिमरिया" in text:
        return _field("सिमरिया", CONF_HEURISTIC)
    return _missing()


def _extract_tehsil(text: str) -> dict:
    res = _extract_labeled(
        text,
        # Bhu-Adhikar: "तहसील\n: सिमरिया"
        r"तहसील\s*\n\s*:\s*([^\n]+)",
        # Khatoni B1: "तहसील: सिमरिया"
        r"तहसील\s*:\s*([^\n]+)",
        # Handwritten / OCR / Seals: "तहसील = सिमरिया", "तहसीलदार सिमरिया", "तह. सिमरिया"
        r"तहसील\s*[=:\-]?\s*([^\s\n\(\)]+)",
        r"तहसीलदार\s+([^\s\n\(\)]+)",
        r"तह(?:सील|\.)\s*([^\s\n\(\)]+)",
        conf=CONF_LABELED_MATCH,
    )
    if res["value"] is not None:
        return res
    if "सिमरिया" in text:
        return _field("सिमरिया", CONF_HEURISTIC)
    return _missing()


def _extract_district(text: str) -> dict:
    res = _extract_labeled(
        text,
        # Bhu-Adhikar: "जिला\n: पन्ना"
        r"जिला\s*\n\s*:\s*([^\n]+)",
        # Khatoni B1: "िला: पन्नाा" — only 'िला' remains after font rendering drops ज
        # The line starts literally with U+093F (ि) U+0932 (ल) U+093E (ा)
        r"िला\s*:\s*([^\n]+)",
        # Handwritten / OCR / Seals: "जिला = पन्ना", "जिला-पन्ना", "जिला पन्ना"
        r"जिला\s*[=:\-]?\s*([^\s\n\(\)]+)",
        r"तहसीलदार.*?जिला\s+([^\s\n\(\)]+)",
        r"जि(?:ला|\.)\s*([^\s\n\(\)]+)",
        conf=CONF_LABELED_MATCH,
    )
    if res["value"] is not None:
        return res
    if "पन्ना" in text:
        return _field("पन्ना", CONF_HEURISTIC)
    return _missing()


def _extract_khata_number(text: str) -> dict:
    # For Khatoni B1, the pattern requires matching across many lines (column headers),
    # so we run it separately with DOTALL enabled.
    # Bhu-Adhikar: "खाता संख्यांांक: 2305" — inline with doubled matra
    m = re.search(r"खाता\s*संख्या[ंां]+क\s*:\s*(\d+)", text, re.MULTILINE)
    if m:
        return _field(m.group(1), CONF_LABELED_MATCH)
    # Khatoni B1: "खाता\nक्रमांक" header then many lines then "2305" standalone
    m2 = re.search(
        r"खाता\s*\n\s*क्रमांक\s*\n[\s\S]{0,3000}?\n(\d{3,6})\n",
        text, re.DOTALL
    )
    if m2:
        return _field(m2.group(1), CONF_LABELED_MATCH)
    # Mutation register / OCR: "खाता क्रमांक 69" or "नामांतरण क्रमांक 22" or "२२"
    m3 = re.search(r"(?:खाता|नामांतरण|नामान्तरण)\s*(?:का)?\s*(?:क्रम|क्रमांक|सं\.?|नं\.?)\s*[:=\-]?\s*([0-9\u0966-\u096F]+)", text)
    if m3:
        val = m3.group(1)
        hindi_to_eng = str.maketrans("०१२३४५६७८९", "0123456789")
        return _field(val.translate(hindi_to_eng), CONF_LABELED_MATCH)
    # Leading row number on a table line e.g. "२२" or "22"
    m4 = re.search(r"^\s*([०-९\d]{1,3})\s+", text, re.MULTILINE)
    if m4:
        val = m4.group(1)
        hindi_to_eng = str.maketrans("०१२३४५६७८९", "0123456789")
        return _field(val.translate(hindi_to_eng), CONF_HEURISTIC)
    return _missing()


def _extract_fasli_year(text: str) -> dict:
    return _extract_labeled(
        text,
        # Both forms: "वर्ष: 2026-2027"
        r"वर्ष\s*:\s*(\d{4}-\d{4})",
        r"(?:वर्ष|सत्र|साल)\s*[:=\-]?\s*(\d{4}(?:-\d{2,4})?)",
        r"\b(20\d{2}[-/]\d{2,4})\b",
        conf=CONF_LABELED_MATCH,
    )


def _extract_patwari_halka(text: str) -> dict:
    return _extract_labeled(
        text,
        # Bhu-Adhikar: "पटवारी हल्काा क्रमांक / सेक्टर क्रमांक: सिमरिया"
        r"पटवारी\s*हल्का+\s*(?:क्रमांक\s*/\s*सेक्टर\s*क्रमांक)?\s*:\s*([^\n]+)",
        # Khatoni B1: "पटवारी हल्काा: सिमरिया"
        r"पटवारी\s*हल्का+\s*:\s*([^\n]+)",
        conf=CONF_LABELED_MATCH,
    )


def _extract_document_type_label(text: str, doc_type_code: str) -> dict:
    """Maps internal doc_type code to a human-readable label."""
    mapping = {
        "bhu_adhikar_pustika": "Bhu-Adhikar Pustika (Form 4)",
        "khatoni_b1": "Khatoni B-1 (Form 7)",
        "revenue_register": "Revenue Mutation Register (सत्य प्रतिलिपि)",
        "other": "Unknown",
    }
    label = mapping.get(doc_type_code, "Unknown")
    # Only assign high confidence if an actual document type was identified
    conf = CONF_LABELED_MATCH if doc_type_code not in ("other", "unknown") else CONF_MISSING
    return _field(label, conf)


def _extract_state(text: str) -> dict:
    """Infer state from document template header text."""
    if "मध्यप्रदेश" in text or "मध्य प्रदेश" in text:
        return _field("मध्य प्रदेश", CONF_HEURISTIC)
    return _missing()


def _parse_parcels_tabular(lines: list[str]) -> list[dict]:
    """Fallback parcel parser for tabular or OCR text."""
    parcels = []
    hindi_to_eng = str.maketrans("०१२३४५६७८९", "0123456789")
    row_re = re.compile(r"\b(\d{1,4}(?:/\d{1,3})?)\s+(\d+\.\d{2,4})(?:\s+(\d+\.\d{2}))?\b")

    seen_surveys = set()
    for line in lines:
        line_eng = line.translate(hindi_to_eng)
        m = row_re.search(line_eng)
        if m:
            s_num = m.group(1)
            area_val = float(m.group(2))
            rev_val = float(m.group(3)) if m.group(3) else None
            if 0.005 <= area_val <= 100.0 and s_num not in seen_surveys:
                seen_surveys.add(s_num)
                parcel = {
                    "parcel_unique_id": _missing(),
                    "survey_number": _field(s_num, CONF_ROW_PARSED),
                    "land_use_flag": _missing(),
                    "area_hectare": _field(area_val, CONF_ROW_PARSED),
                    "land_use": _field("कृषि", CONF_HEURISTIC),
                    "land_revenue_rs": _field(rev_val, CONF_ROW_PARSED if rev_val else CONF_MISSING),
                }
                parcels.append(parcel)
    return parcels


# ---------------------------------------------------------------------------
# Main extraction entry point
# ---------------------------------------------------------------------------

def extract_fields(raw_text: str, document_type: str = "other") -> dict:
    """
    Main entry point for Phase 3 field extraction.

    Args:
        raw_text:      Full text extracted by Phase 2 pipeline.
        document_type: Document type code from Phase 2 inference
                       ('bhu_adhikar_pustika', 'khatoni_b1', 'revenue_register', or 'other').

    Returns:
        Dict with keys 'khata', 'owners', 'parcels' matching PRD Section 8.4,
        plus a top-level 'extraction_meta' dict with summary statistics.
    """
    text = _norm(raw_text)
    lines = [l.strip() for l in text.splitlines()]
    # Remove empty lines for sequential scanning
    non_empty_lines = [l for l in lines if l]

    logger.info(f"Extracting fields from {len(non_empty_lines)} non-empty lines, doc_type={document_type}")

    # ---- Khata-level fields ------------------------------------------------
    khata = {
        "clrm_no":          _extract_clrm_no(text),
        "village":          _extract_village(text),
        "tehsil":           _extract_tehsil(text),
        "district":         _extract_district(text),
        "khata_number":     _extract_khata_number(text),
        "fasli_year":       _extract_fasli_year(text),
        "patwari_halka_no": _extract_patwari_halka(text),
        "state":            _extract_state(text),
        "document_type":    _extract_document_type_label(text, document_type),
    }

    # ---- Owners ------------------------------------------------------------
    owners = _parse_owners(non_empty_lines)
    logger.info(f"Extracted {len(owners)} owner records")

    # ---- Parcels -----------------------------------------------------------
    if document_type == "khatoni_b1":
        parcels = _parse_parcels_khatoni_b1(non_empty_lines)
    else:
        # Default: Bhu-Adhikar Pustika layout (also used for 'other' as best guess)
        parcels = _parse_parcels_bhu_adhikar(non_empty_lines)

    # Fallback for tabular / register OCR formats
    if not parcels:
        parcels = _parse_parcels_tabular(non_empty_lines)

    logger.info(f"Extracted {len(parcels)} parcel records")

    # ---- Extraction meta ---------------------------------------------------
    # Compute confidence only on actual land record data fields (exclude metadata fields like document_type)
    khata_values = [
        v for k, v in khata.items()
        if v["value"] is not None and k != "document_type"
    ]
    khata_confidences = [v["confidence"] for v in khata_values]
    owner_confidences = [
        v["confidence"]
        for owner in owners
        for v in owner.values()
        if v["value"] is not None
    ]
    parcel_confidences = [
        v["confidence"]
        for parcel in parcels
        for v in parcel.values()
        if v["value"] is not None
    ]

    all_confidences = khata_confidences + owner_confidences + parcel_confidences
    avg_confidence = round(sum(all_confidences) / len(all_confidences), 4) if all_confidences else 0.0

    required_fields = {"clrm_no", "village", "tehsil", "district", "khata_number"}
    missing_required = [f for f in required_fields if khata.get(f, {}).get("value") is None]

    extraction_meta = {
        "document_type": document_type,
        "khata_fields_found": len(khata_values),
        "khata_fields_total": len([k for k in khata if k != "document_type"]),
        "owners_found": len(owners),
        "parcels_found": len(parcels),
        "average_confidence": avg_confidence,
        "missing_required_fields": missing_required,
        "needs_review": len(missing_required) > 0 or avg_confidence < 0.70,
    }

    return {
        "khata": khata,
        "owners": owners,
        "parcels": parcels,
        "extraction_meta": extraction_meta,
    }

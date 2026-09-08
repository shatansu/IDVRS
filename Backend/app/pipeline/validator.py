"""
Phase 4 — Validation Rules Engine
===================================
Implements PRD Section 10 validation rules on the structured extraction
result produced by Phase 3's field_extractor.extract_fields().

Runs BEFORE saving to DB (so warnings are included in API response), and
also performs a DB lookup for duplicate detection using the live SQLAlchemy
session passed in by the caller.

Output shape — a 'validation' object added to structured_data:
{
  "passed": bool,                  # True only if zero errors (warnings OK)
  "errors": [ { "rule", "field", "message" }, ... ],    # blockers
  "warnings": [ { "rule", "field", "message" }, ... ],  # advisory only
  "is_duplicate": bool,
  "duplicate_matches": [ { "khata_id", "clrm_no", "khata_number",
                            "village", "match_reason" }, ... ]
}
"""

import re
import logging
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session

from app.models import Khata

logger = logging.getLogger("app.pipeline.validator")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
CURRENT_YEAR = datetime.now().year
# Fasli year is an agricultural year (e.g. "2026-2027").
# We allow up to 1 year ahead of calendar year (government documents can be
# issued for the coming fasli year before it starts).
MAX_ALLOWED_FASLI_START = CURRENT_YEAR + 1

# Survey number pattern: digits, optional /digits, optional space, optional (S) or (P)
# Examples: "96/1 (S)", "100 (S)", "45/2 (P)", "113/1 (S)"
SURVEY_NUMBER_RE = re.compile(
    r"^\d+(?:/\d+)?\s*(?:\([SP]\))?$"
)

# Fasli year pattern: "YYYY-YYYY" or "YYYY-YY"
FASLI_YEAR_RE = re.compile(r"^(\d{4})-(\d{2,4})$")

# Share fraction patterns (e.g., "1/3", "2/4", "0.5", "50%")
SHARE_FRACTION_RE = re.compile(r"^(\d+)\s*/\s*(\d+)$")
DECIMAL_OR_PCT_RE = re.compile(r"^(\d+(?:\.\d+)?)\s*(%?)$")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_val(field_dict: dict) -> Optional[str]:
    """Safely extract .value from a confidence-wrapped field dict."""
    if not field_dict:
        return None
    return field_dict.get("value")


def _error(rule: str, field: str, message: str) -> dict:
    return {"rule": rule, "field": field, "message": message}


def _warning(rule: str, field: str, message: str) -> dict:
    return {"rule": rule, "field": field, "message": message}


# ---------------------------------------------------------------------------
# Rule 1: Required field check
# ---------------------------------------------------------------------------

REQUIRED_KHATA_FIELDS = {
    "khata_number": "खाता संख्यांक",
    "village":      "ग्राम",
    "tehsil":       "तहसील",
    "district":     "जिला",
}


def _check_required_fields(khata: dict, owners: list) -> tuple[list, list]:
    errors, warnings = [], []

    # Required khata-level fields
    for field_key, hindi_label in REQUIRED_KHATA_FIELDS.items():
        val = _get_val(khata.get(field_key))
        if not val:
            errors.append(_error(
                rule="required_field",
                field=field_key,
                message=f"Required field '{hindi_label}' ({field_key}) is missing or empty."
            ))

    # clrm_no: strongly recommended but not hard-blocking (some documents may lack it)
    if not _get_val(khata.get("clrm_no")):
        warnings.append(_warning(
            rule="required_field",
            field="clrm_no",
            message="CLRM No is missing. Duplicate detection will fall back to khata_number + village + tehsil only."
        ))

    # At least one owner with a non-empty name
    named_owners = [
        o for o in owners
        if _get_val(o.get("owner_name"))
    ]
    if not named_owners:
        errors.append(_error(
            rule="required_field",
            field="owners",
            message="No owner records with a valid owner_name were extracted. At least one owner is required."
        ))

    return errors, warnings


# ---------------------------------------------------------------------------
# Rule 2: Format checks
# ---------------------------------------------------------------------------

def _check_formats(khata: dict, parcels: list) -> tuple[list, list]:
    errors, warnings = [], []

    # fasli_year format
    fasli_raw = _get_val(khata.get("fasli_year"))
    if fasli_raw:
        m = FASLI_YEAR_RE.match(str(fasli_raw).strip())
        if not m:
            warnings.append(_warning(
                rule="format_check",
                field="fasli_year",
                message=f"fasli_year '{fasli_raw}' does not match expected YYYY-YYYY format."
            ))

    # Per-parcel format checks
    for idx, parcel in enumerate(parcels):
        label = f"parcels[{idx}]"

        # survey_number format
        survey = _get_val(parcel.get("survey_number"))
        if survey is not None:
            if not SURVEY_NUMBER_RE.match(str(survey).strip()):
                warnings.append(_warning(
                    rule="format_check",
                    field=f"{label}.survey_number",
                    message=f"survey_number '{survey}' does not match expected pattern (e.g. '96/1 (S)')."
                ))

        # area_hectare: must be a positive number
        area = parcel.get("area_hectare", {}).get("value")
        if area is not None:
            try:
                area_f = float(area)
                if area_f <= 0:
                    errors.append(_error(
                        rule="format_check",
                        field=f"{label}.area_hectare",
                        message=f"area_hectare must be a positive number, got {area}."
                    ))
            except (TypeError, ValueError):
                errors.append(_error(
                    rule="format_check",
                    field=f"{label}.area_hectare",
                    message=f"area_hectare '{area}' is not a valid number."
                ))

        # land_revenue_rs: must be a non-negative number
        revenue = parcel.get("land_revenue_rs", {}).get("value")
        if revenue is not None:
            try:
                rev_f = float(revenue)
                if rev_f < 0:
                    errors.append(_error(
                        rule="format_check",
                        field=f"{label}.land_revenue_rs",
                        message=f"land_revenue_rs must be >= 0, got {revenue}."
                    ))
            except (TypeError, ValueError):
                errors.append(_error(
                    rule="format_check",
                    field=f"{label}.land_revenue_rs",
                    message=f"land_revenue_rs '{revenue}' is not a valid number."
                ))

    return errors, warnings


# ---------------------------------------------------------------------------
# Rule 3: Date / year sanity check
# ---------------------------------------------------------------------------

def _check_date_sanity(khata: dict) -> tuple[list, list]:
    errors, warnings = [], []

    fasli_raw = _get_val(khata.get("fasli_year"))
    if fasli_raw:
        m = FASLI_YEAR_RE.match(str(fasli_raw).strip())
        if m:
            start_year = int(m.group(1))
            raw_end    = m.group(2)
            end_year   = int(raw_end) if len(raw_end) == 4 else int(str(start_year)[:2] + raw_end)

            # Second year must be start + 1
            if end_year != start_year + 1:
                warnings.append(_warning(
                    rule="date_sanity",
                    field="fasli_year",
                    message=f"fasli_year '{fasli_raw}': end year ({end_year}) should be start year + 1 ({start_year + 1})."
                ))

            # Cannot be a future fasli year beyond reasonable range
            if start_year > MAX_ALLOWED_FASLI_START:
                errors.append(_error(
                    rule="date_sanity",
                    field="fasli_year",
                    message=(
                        f"fasli_year '{fasli_raw}' is too far in the future "
                        f"(start year {start_year} > {MAX_ALLOWED_FASLI_START})."
                    )
                ))

            # Cannot be unreasonably old (pre-1950 = likely OCR garbage)
            if start_year < 1950:
                warnings.append(_warning(
                    rule="date_sanity",
                    field="fasli_year",
                    message=f"fasli_year '{fasli_raw}' has an unusually early start year ({start_year}). Please verify."
                ))

    return errors, warnings


# ---------------------------------------------------------------------------
# Rule 3b: Owner share-fraction check
# ---------------------------------------------------------------------------

def _check_owner_share_fractions(owners: list) -> tuple[list, list]:
    """
    Validates owner share fractions according to constraint rules:
    - Invalid format, negative share, or zero denominator -> BLOCKING ERROR.
    - Total share sum > 1.0 -> BLOCKING ERROR (co-owners cannot own > 100%).
    - Total share sum < 1.0 -> ADVISORY WARNING (parcel portion may be undivided).
    """
    errors, warnings = [], []
    parsed_shares = []
    has_specified_share = False

    for idx, owner in enumerate(owners):
        label = f"owners[{idx}].share_fraction"
        share_raw = _get_val(owner.get("share_fraction")) if isinstance(owner.get("share_fraction"), dict) else owner.get("share_fraction")
        if share_raw is None or str(share_raw).strip() == "":
            continue

        has_specified_share = True
        s_str = str(share_raw).strip()

        # Fraction format (e.g. "1/3", "2/4")
        frac_match = SHARE_FRACTION_RE.match(s_str)
        if frac_match:
            num = int(frac_match.group(1))
            den = int(frac_match.group(2))
            if den == 0:
                errors.append(_error(
                    rule="share_fraction_invalid",
                    field=label,
                    message=f"Division by zero in share fraction '{s_str}'."
                ))
            elif num < 0:
                errors.append(_error(
                    rule="share_fraction_invalid",
                    field=label,
                    message=f"Share fraction numerator cannot be negative: '{s_str}'."
                ))
            else:
                parsed_shares.append(float(num) / float(den))
            continue

        # Decimal or Percentage format (e.g. "0.5", "50%")
        dec_match = DECIMAL_OR_PCT_RE.match(s_str)
        if dec_match:
            val = float(dec_match.group(1))
            is_pct = dec_match.group(2) == "%"
            frac_val = (val / 100.0) if is_pct else val
            if frac_val < 0:
                errors.append(_error(
                    rule="share_fraction_invalid",
                    field=label,
                    message=f"Share fraction cannot be negative: '{s_str}'."
                ))
            else:
                parsed_shares.append(frac_val)
            continue

        # Invalid format
        errors.append(_error(
            rule="share_fraction_invalid",
            field=label,
            message=f"Invalid share fraction format '{s_str}'. Expected format like '1/3', '1/2', or '0.5'."
        ))

    # Evaluate sum if valid shares were parsed and no invalid fraction errors
    if has_specified_share and not errors and parsed_shares:
        total_share = sum(parsed_shares)
        if total_share > 1.0001:
            errors.append(_error(
                rule="share_fraction_sum",
                field="owners.share_fraction",
                message=f"Total owner share fractions exceed 1.0 (sum = {round(total_share, 4)}). Co-owners cannot hold more than 100% of the parcel."
            ))
        elif total_share < 0.9999 and len(parsed_shares) > 1:
            warnings.append(_warning(
                rule="share_fraction_sum",
                field="owners.share_fraction",
                message=f"Total owner share fractions sum to {round(total_share, 4)} (< 1.0). Portion of the khata may be undivided or unspecified."
            ))

    return errors, warnings


# ---------------------------------------------------------------------------
# Rule 4: Duplicate detection (requires DB session)
# ---------------------------------------------------------------------------

def _check_duplicate(khata: dict, db: Session) -> tuple[list, list, bool, list]:
    """
    Checks the `khatas` table for records matching:
      (a) same clrm_no  — strongest signal
      (b) same khata_number + village + tehsil  — fallback
    Returns (errors, warnings, is_duplicate, duplicate_matches).
    Duplicate is a WARNING, not an ERROR — save is allowed but flagged.
    """
    warnings = []
    duplicate_matches = []
    is_duplicate = False

    clrm_no      = _get_val(khata.get("clrm_no"))
    khata_number = _get_val(khata.get("khata_number"))
    village      = _get_val(khata.get("village"))
    tehsil       = _get_val(khata.get("tehsil"))

    # (a) clrm_no match — unique document identifier
    if clrm_no:
        existing_by_clrm = (
            db.query(Khata)
            .filter(Khata.clrm_no == clrm_no)
            .all()
        )
        for existing in existing_by_clrm:
            is_duplicate = True
            duplicate_matches.append({
                "khata_id":    existing.id,
                "clrm_no":     existing.clrm_no,
                "khata_number": existing.khata_number,
                "village":     existing.village,
                "match_reason": "clrm_no"
            })
            logger.warning(
                f"Duplicate detected: clrm_no='{clrm_no}' already exists "
                f"as khata_id={existing.id}"
            )

    # (b) khata_number + village + tehsil — fallback composite key
    if khata_number and village and tehsil:
        # Normalise: strip extra matras from Khatoni B1 (e.g. "पन्नाा" → "पन्ना")
        # Simple approach: compare stripped versions
        existing_by_composite = (
            db.query(Khata)
            .filter(
                Khata.khata_number == khata_number,
                Khata.village.like(f"%{village[:4]}%"),   # first 4 chars to handle matra variants
                Khata.tehsil.like(f"%{tehsil[:4]}%"),
            )
            .all()
        )
        for existing in existing_by_composite:
            # Avoid double-reporting if already caught by clrm_no
            already_reported = any(
                d["khata_id"] == existing.id for d in duplicate_matches
            )
            if not already_reported:
                is_duplicate = True
                duplicate_matches.append({
                    "khata_id":    existing.id,
                    "clrm_no":     existing.clrm_no,
                    "khata_number": existing.khata_number,
                    "village":     existing.village,
                    "match_reason": "khata_number+village+tehsil"
                })
                logger.warning(
                    f"Duplicate detected: khata_number='{khata_number}' village='{village}' "
                    f"tehsil='{tehsil}' already exists as khata_id={existing.id}"
                )

    if is_duplicate:
        warnings.append(_warning(
            rule="duplicate_detection",
            field="khata",
            message=(
                f"Possible duplicate: {len(duplicate_matches)} matching record(s) found in database. "
                f"Match reasons: {', '.join(set(d['match_reason'] for d in duplicate_matches))}. "
                "Record will still be saved — please verify manually."
            )
        ))

    return [], warnings, is_duplicate, duplicate_matches


# ---------------------------------------------------------------------------
# Main validation entry point
# ---------------------------------------------------------------------------

def validate_extraction(
    structured_data: dict,
    db: Session,
) -> dict:
    """
    Runs all Phase 4 validation rules against the structured extraction result.

    Args:
        structured_data: Output of field_extractor.extract_fields()
        db:              Active SQLAlchemy session (for duplicate DB lookup)

    Returns:
        A 'validation' dict to be merged into the API response structured_data.
        {
          "passed": bool,
          "errors": [...],
          "warnings": [...],
          "is_duplicate": bool,
          "duplicate_matches": [...]
        }
    """
    khata   = structured_data.get("khata", {})
    owners  = structured_data.get("owners", [])
    parcels = structured_data.get("parcels", [])

    all_errors: list[dict]   = []
    all_warnings: list[dict] = []

    # Rule 1: Required fields
    e, w = _check_required_fields(khata, owners)
    all_errors.extend(e)
    all_warnings.extend(w)

    # Rule 2: Format checks
    e, w = _check_formats(khata, parcels)
    all_errors.extend(e)
    all_warnings.extend(w)

    # Rule 3: Date sanity
    e, w = _check_date_sanity(khata)
    all_errors.extend(e)
    all_warnings.extend(w)

    # Rule 3b: Owner share fractions
    e, w = _check_owner_share_fractions(owners)
    all_errors.extend(e)
    all_warnings.extend(w)

    # Rule 4: Duplicate detection (DB lookup)
    is_duplicate = False
    duplicate_matches: list[dict] = []
    try:
        e, w, is_duplicate, duplicate_matches = _check_duplicate(khata, db)
        all_errors.extend(e)
        all_warnings.extend(w)
    except Exception as exc:
        logger.error(f"Duplicate check failed (non-fatal): {exc}")
        all_warnings.append(_warning(
            rule="duplicate_detection",
            field="khata",
            message=f"Duplicate check could not complete: {exc}"
        ))

    passed = len(all_errors) == 0

    logger.info(
        f"Validation complete: passed={passed}, "
        f"errors={len(all_errors)}, warnings={len(all_warnings)}, "
        f"is_duplicate={is_duplicate}"
    )

    return {
        "passed": passed,
        "errors": all_errors,
        "warnings": all_warnings,
        "is_duplicate": is_duplicate,
        "duplicate_matches": duplicate_matches,
    }


def validate_record_payload(payload_dict: dict, db: Session) -> dict:
    """
    Authoritative server-side re-validation for the final user-edited data payload
    sent to POST /api/records before saving to MySQL.
    """
    khata = payload_dict.get("khata", {})
    owners = payload_dict.get("owners", [])
    parcels = payload_dict.get("parcels", [])

    # Ensure khata fields are wrapped or plain-compatible
    wrapped_khata = {}
    for k, v in khata.items():
        if isinstance(v, dict) and "value" in v:
            wrapped_khata[k] = v
        else:
            wrapped_khata[k] = {"value": v}

    wrapped_owners = []
    for o in owners:
        w_o = {}
        o_dict = o.dict() if hasattr(o, "dict") else (o if isinstance(o, dict) else o.__dict__)
        for k, v in o_dict.items():
            if isinstance(v, dict) and "value" in v:
                w_o[k] = v
            else:
                w_o[k] = {"value": v}
        wrapped_owners.append(w_o)

    wrapped_parcels = []
    for p in parcels:
        w_p = {}
        p_dict = p.dict() if hasattr(p, "dict") else (p if isinstance(p, dict) else p.__dict__)
        for k, v in p_dict.items():
            if isinstance(v, dict) and "value" in v:
                w_p[k] = v
            else:
                w_p[k] = {"value": v}
        wrapped_parcels.append(w_p)

    structured_data = {
        "khata": wrapped_khata,
        "owners": wrapped_owners,
        "parcels": wrapped_parcels,
    }

    return validate_extraction(structured_data, db)

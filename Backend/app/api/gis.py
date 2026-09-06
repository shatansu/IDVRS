"""
GIS / Cadastral Map Engine (GIS-1) API Router
=============================================
Provides endpoints for cadastral parcel spatial geometry, administrative filtering,
and runtime cross-matching with relational land records stored in MySQL.

Conforms strictly to GIS_guide.md specifications:
- 5-part matching key: (state, district, tehsil, village, survey_no)
- Clear separation of khata_id (DB integer PK) vs khata_number (revenue string)
- Explicit synthetic/prototype provenance disclosure (never authoritative)
- Recorded area vs Spatial area distinction (spatial area explicitly 'Not calculated')

GIS-1 Refinements applied:
- build_gis_lookups(): single batch DB load per request, eliminates N+1 anti-pattern
- enrich_feature_with_record(): now uses in-memory lookup dicts (no DB access)
- Ambiguous match semantics hardened: same-khata_number collapse requires
  parcel_unique_id agreement to avoid false MATCHED on genuinely distinct records
- /hierarchy returns nested State->District->Tehsil->Village tree + flat lists
"""

import json
import logging
import unicodedata
import re
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Khata, KhataParcel, KhataOwner

logger = logging.getLogger("app.api.gis")

router = APIRouter(prefix="/api/gis", tags=["GIS & Cadastral Map"])

# ---------------------------------------------------------------------------
# Static Dataset Loader
# ---------------------------------------------------------------------------

# Path to cadastral demo GeoJSON
BASE_DIR = Path(__file__).resolve().parent.parent.parent
GEOJSON_PATH = BASE_DIR / "gis_data" / "cadastral_demo.geojson"

# In-memory cache for static GeoJSON (immutable across requests)
_GEOJSON_CACHE: Optional[dict] = None


def load_spatial_dataset() -> dict:
    """Loads and caches the cadastral demo GeoJSON dataset."""
    global _GEOJSON_CACHE
    if _GEOJSON_CACHE is None:
        if not GEOJSON_PATH.exists():
            logger.error(f"GeoJSON dataset not found at: {GEOJSON_PATH}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Cadastral spatial dataset not found on server.",
            )
        with open(GEOJSON_PATH, "r", encoding="utf-8") as f:
            _GEOJSON_CACHE = json.load(f)
        logger.info(
            f"Loaded {len(_GEOJSON_CACHE.get('features', []))} cadastral features "
            f"from {GEOJSON_PATH}"
        )
    return _GEOJSON_CACHE


# ---------------------------------------------------------------------------
# Text Normalization Utilities
# ---------------------------------------------------------------------------

def _norm(val: Optional[str]) -> str:
    """
    Normalizes textual tokens for 5-part key matching:
    - NFC Unicode normalization
    - Removes zero-width joiners / BOM
    - Deduplicates consecutive Devanagari vowel signs (font-glitch artifact)
    - Strips '(S)' parcel-status annotations
    - Strips whitespace; lowercases Latin text
    """
    if not val:
        return ""
    text = unicodedata.normalize("NFC", str(val).strip())
    # Remove zero-width chars
    text = re.sub(r"[\u200b\u200c\u200d\ufeff]+", "", text)
    # Deduplicate consecutive Devanagari vowel signs (e.g. 'पन्नाा' -> 'पन्ना')
    text = re.sub(r"([\u0901-\u0903\u093E-\u094D])\1+", r"\1", text)
    # Strip '(S)' or similar parcel flag
    text = re.sub(r"\s*\(S\)", "", text, flags=re.IGNORECASE)
    return text.strip().lower()


def _is_text_match(
    feature_val: Optional[str],
    feature_val_en: Optional[str],
    query_val: Optional[str],
) -> bool:
    """Checks if a feature's Hindi or English value matches a query value."""
    if not query_val:
        return True
    q = _norm(query_val)
    f_hi = _norm(feature_val)
    f_en = _norm(feature_val_en)
    return (q in f_hi) or (q in f_en) or (f_hi in q) or (f_en in q)


# ---------------------------------------------------------------------------
# Batch DB Lookup (eliminates N+1 query per GeoJSON feature)
# ---------------------------------------------------------------------------

def build_gis_lookups(
    db: Session,
    target_khata_id: Optional[int] = None,
) -> Tuple[Dict[str, List[Dict[str, Any]]], Dict[int, str]]:
    """
    Loads all KhataParcel + Khata + KhataOwner data in a single query batch.

    Returns:
        parcels_lookup : Dict[normalized_survey_no -> List[parcel_match_info]]
            Each entry contains all fields needed for 5-part matching and enrichment.
        owners_lookup  : Dict[khata_id -> primary_owner_name]
            First owner per khata_id, used as the display owner in the GIS card.

    This replaces the previous pattern where every GeoJSON feature triggered:
        - db.query(KhataParcel).join(Khata).all()   (full table scan)
        - db.query(KhataOwner).filter(...).first()  (per-match owner lookup)
    With two total queries per API request regardless of feature count.
    """
    # --- Query 1: All parcels joined with their parent Khata ---
    q = db.query(KhataParcel, Khata).join(Khata, KhataParcel.khata_id == Khata.id)
    if target_khata_id is not None:
        q = q.filter(Khata.id == target_khata_id)
    rows = q.all()

    # Collect unique khata_ids for the owner batch query
    khata_ids: List[int] = list({k.id for _, k in rows})

    # --- Query 2: All owners for the involved Khata records ---
    owners_lookup: Dict[int, str] = {}
    if khata_ids:
        owners_raw = (
            db.query(KhataOwner)
            .filter(KhataOwner.khata_id.in_(khata_ids))
            .all()
        )
        # Keep only the first owner per khata_id (primary owner for display)
        for owner in owners_raw:
            if owner.khata_id not in owners_lookup:
                owners_lookup[owner.khata_id] = owner.owner_name or ""

    # --- Build normalized survey_no -> list-of-match-info lookup ---
    parcels_lookup: Dict[str, List[Dict[str, Any]]] = {}
    for p, k in rows:
        key = _norm(p.survey_number)
        if not key:
            continue
        if key not in parcels_lookup:
            parcels_lookup[key] = []
        parcels_lookup[key].append({
            "khata_id": k.id,
            "khata_number": k.khata_number,
            "record_id": k.id,
            "primary_owner": owners_lookup.get(k.id, ""),
            "recorded_area_hectare": p.area_hectare,
            "land_use_flag": p.land_use_flag,
            "parcel_unique_id": p.parcel_unique_id,
            "review_status": (
                k.review_status.value
                if hasattr(k.review_status, "value")
                else str(k.review_status)
            ),
            "is_duplicate_flag": k.is_duplicate_flag,
            # Pre-normalized admin keys for 5-part matching (avoids re-normalization per feature)
            "k_village": _norm(k.village),
            "k_tehsil": _norm(k.tehsil),
            "k_district": _norm(k.district),
            "k_state": _norm(k.state),
        })

    return parcels_lookup, owners_lookup


# ---------------------------------------------------------------------------
# Core Enrichment Logic
# ---------------------------------------------------------------------------

def enrich_feature_with_record(
    feature: dict,
    parcels_lookup: Dict[str, List[Dict[str, Any]]],
    owners_lookup: Dict[int, str],
    target_khata_id: Optional[int] = None,
) -> dict:
    """
    Enriches a spatial GeoJSON feature by cross-matching it against pre-loaded
    in-memory land-record lookup dicts.

    Uses the full 5-part prototype matching key:
        (state, district, tehsil, village, survey_no)

    Match semantics:
        MATCHED    — Exactly one logical land record matched.
                     Also MATCHED when multiple DB rows share one khata_number
                     AND their parcel_unique_ids do not conflict (duplicate uploads
                     of the same logical record); exposes is_duplicate_flag=True.
        UNMATCHED  — No MySQL record satisfies the 5-part key.
        AMBIGUOUS  — Multiple genuinely distinct Khata records claim this parcel
                     (different khata_numbers, or conflicting parcel_unique_ids).
                     Human review required; ambiguous_khatas list exposed.

    Area integrity (GIS_guide.md §33):
        recorded_area_hectare  = from MySQL KhataParcel (authoritative)
        spatial_area_hectare   = 'Not calculated' (synthetic polygon, never overridden)

    Provenance (always set):
        geometry_status = 'DEMO'
        source_type     = 'prototype'
        authoritative   = False
    """
    props = dict(feature.get("properties", {}))

    # Normalize feature's 5-part key values
    feat_survey     = _norm(props.get("survey_no"))
    feat_village    = _norm(props.get("village"))
    feat_village_en = _norm(props.get("village_en"))
    feat_tehsil     = _norm(props.get("tehsil"))
    feat_tehsil_en  = _norm(props.get("tehsil_en"))
    feat_district   = _norm(props.get("district"))
    feat_district_en = _norm(props.get("district_en"))
    feat_state      = _norm(props.get("state"))
    feat_state_en   = _norm(props.get("state_en"))

    # Candidate parcels for this survey_no (O(1) lookup, no DB hit)
    candidates = parcels_lookup.get(feat_survey, [])

    matched_records: List[Dict[str, Any]] = []

    for m in candidates:
        # If a specific khata is requested, skip others immediately
        if target_khata_id is not None and m["khata_id"] != target_khata_id:
            continue

        # --- 5-part key matching ---
        # Village (required — the spatial anchor of the 5-part key)
        if not (
            m["k_village"] == feat_village
            or m["k_village"] == feat_village_en
            or feat_village in m["k_village"]
        ):
            continue

        # Tehsil (conditional — skip check only when one side is absent)
        if m["k_tehsil"] and feat_tehsil and not (
            m["k_tehsil"] == feat_tehsil
            or m["k_tehsil"] == feat_tehsil_en
            or feat_tehsil in m["k_tehsil"]
        ):
            continue

        # District (conditional)
        if m["k_district"] and feat_district and not (
            m["k_district"] == feat_district
            or m["k_district"] == feat_district_en
            or feat_district in m["k_district"]
        ):
            continue

        # State (conditional)
        if m["k_state"] and feat_state and not (
            m["k_state"] == feat_state
            or m["k_state"] == feat_state_en
            or feat_state in m["k_state"]
        ):
            continue

        # All 5 key parts matched
        matched_records.append(m)

    # Deduplicate by khata_id (keep first occurrence per khata_id)
    unique_khatas: Dict[int, Dict[str, Any]] = {}
    for m in matched_records:
        if m["khata_id"] not in unique_khatas:
            unique_khatas[m["khata_id"]] = m

    # --- Resolve match status ---
    if len(unique_khatas) == 0:
        # No match for this parcel in MySQL
        props["match_status"] = "UNMATCHED"
        props["khata_id"]      = None
        props["khata_number"]  = None
        props["record_id"]     = None

    elif len(unique_khatas) == 1:
        # Clean single-record match
        match_info = next(iter(unique_khatas.values()))
        props["match_status"]           = "MATCHED"
        props["khata_id"]               = match_info["khata_id"]
        props["khata_number"]           = match_info["khata_number"]
        props["record_id"]              = match_info["record_id"]
        props["primary_owner"]          = match_info["primary_owner"]
        props["recorded_area_hectare"]  = match_info["recorded_area_hectare"]
        props["parcel_unique_id"]       = match_info["parcel_unique_id"]
        props["review_status"]          = match_info["review_status"]
        props["is_duplicate_flag"]      = match_info["is_duplicate_flag"]

    else:
        # Multiple distinct khata_ids matched — evaluate collapse eligibility.
        distinct_khata_numbers = {
            m["khata_number"]
            for m in unique_khatas.values()
            if m.get("khata_number")
        }
        # Collect non-null parcel_unique_ids to detect genuinely distinct parcel claims
        distinct_parcel_uids = {
            m["parcel_unique_id"]
            for m in unique_khatas.values()
            if m.get("parcel_unique_id")
        }

        # Collapse to MATCHED only when:
        #   1. All matching DB rows share the same khata_number (same revenue record), AND
        #   2. Their parcel_unique_ids do not conflict (at most one distinct non-null value),
        #      meaning they are duplicate uploads of the same logical record, not two
        #      genuinely different parcels that happen to share a survey number.
        can_collapse = (
            len(distinct_khata_numbers) == 1
            and len(distinct_parcel_uids) <= 1
        )

        if can_collapse:
            # Prefer the verified record; fall back to the first DB record found
            chosen = next(
                (m for m in unique_khatas.values() if m["review_status"] == "verified"),
                next(iter(unique_khatas.values())),
            )
            props["match_status"]            = "MATCHED"
            props["khata_id"]                = chosen["khata_id"]
            props["khata_number"]            = chosen["khata_number"]
            props["record_id"]               = chosen["record_id"]
            props["primary_owner"]           = chosen["primary_owner"]
            props["recorded_area_hectare"]   = chosen["recorded_area_hectare"]
            props["parcel_unique_id"]        = chosen["parcel_unique_id"]
            props["review_status"]           = chosen["review_status"]
            props["is_duplicate_flag"]       = True
            props["duplicate_records_count"] = len(unique_khatas)
        else:
            # Genuinely ambiguous: multiple different Khata records claim this parcel
            props["match_status"]            = "AMBIGUOUS"
            props["khata_id"]                = None
            props["khata_number"]            = None
            props["record_id"]               = None
            props["ambiguous_matches_count"] = len(unique_khatas)
            props["ambiguous_khatas"]        = sorted(distinct_khata_numbers)

    # --- Area integrity (GIS_guide.md §33) ---
    # Spatial geometry area is NEVER computed from polygon coordinates.
    # The recorded_area_hectare from MySQL is authoritative; spatial_area_hectare
    # is explicitly marked 'Not calculated' for all synthetic demo polygons.
    props["spatial_area_hectare"] = "Not calculated"

    # --- Provenance (always set, never overrideable) ---
    props["geometry_status"] = "DEMO"
    props["source_type"]     = "prototype"
    props["authoritative"]   = False
    props["disclaimer"] = (
        "Prototype polygons using survey numbers from the sample land records; "
        "geometry is synthetic/demo geometry."
    )

    return {
        "type": "Feature",
        "id": feature.get("id"),
        "properties": props,
        "geometry": feature.get("geometry"),
    }


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------

@router.get("/parcels", status_code=status.HTTP_200_OK)
def list_gis_parcels(
    state: Optional[str] = Query(None, description="Filter by state (Hindi or English)"),
    district: Optional[str] = Query(None, description="Filter by district (Hindi or English)"),
    tehsil: Optional[str] = Query(None, description="Filter by tehsil (Hindi or English)"),
    village: Optional[str] = Query(None, description="Filter by village (Hindi or English)"),
    survey_no: Optional[str] = Query(None, description="Filter by survey / khasra number"),
    khata_id: Optional[int] = Query(None, description="Filter by database Khata ID (PK integer)"),
    khata_number: Optional[str] = Query(None, description="Filter by official Khata revenue number"),
    parcel_id: Optional[str] = Query(None, description="Filter by spatial parcel ID"),
    q: Optional[str] = Query(None, description="General search across survey_no, parcel_id, khata_number, village, or owner name"),
    db: Session = Depends(get_db),
):
    """
    Returns a GeoJSON FeatureCollection of cadastral parcels with runtime land-record
    integration. Supports full cascading administrative filtering (state/district/tehsil/village),
    survey number, khata_id, khata_number, parcel_id, and general query.

    DB data is loaded once per request via build_gis_lookups() — no N+1 per feature.
    """
    dataset = load_spatial_dataset()
    raw_features = dataset.get("features", [])

    # --- Single batch DB load for the entire request ---
    parcels_lookup, owners_lookup = build_gis_lookups(db, target_khata_id=khata_id)

    enriched_features = []

    for f in raw_features:
        props = f.get("properties", {})

        # 1. Direct Spatial Filters — applied before enrichment to skip unnecessary work
        if parcel_id and _norm(parcel_id) != _norm(props.get("parcel_id")):
            continue
        if survey_no and _norm(survey_no) != _norm(props.get("survey_no")):
            continue
        if village and not _is_text_match(props.get("village"), props.get("village_en"), village):
            continue
        if tehsil and not _is_text_match(props.get("tehsil"), props.get("tehsil_en"), tehsil):
            continue
        if district and not _is_text_match(props.get("district"), props.get("district_en"), district):
            continue
        if state and not _is_text_match(props.get("state"), props.get("state_en"), state):
            continue

        # 2. Enrich feature using pre-loaded in-memory lookup dicts (zero DB round-trips here)
        enriched = enrich_feature_with_record(
            f, parcels_lookup, owners_lookup, target_khata_id=khata_id
        )
        e_props = enriched["properties"]

        # 3. Post-enrichment filters (require enriched data to resolve)
        if khata_id is not None and e_props.get("khata_id") != khata_id:
            continue
        if khata_number and _norm(khata_number) != _norm(e_props.get("khata_number")):
            continue

        # 4. General search query (q) — broad substring match across key fields
        if q:
            q_norm = _norm(q)
            s_no    = _norm(e_props.get("survey_no"))
            p_id    = _norm(e_props.get("parcel_id"))
            k_no    = _norm(e_props.get("khata_number"))
            vil_hi  = _norm(e_props.get("village"))
            vil_en  = _norm(e_props.get("village_en"))
            owner   = _norm(e_props.get("primary_owner"))

            matches_q = (
                q_norm in s_no or s_no in q_norm
                or q_norm in p_id
                or (k_no and (q_norm in k_no or k_no in q_norm))
                or q_norm in vil_hi or q_norm in vil_en
                or q_norm in owner
            )
            if not matches_q:
                continue

        enriched_features.append(enriched)

    metadata = dict(dataset.get("metadata", {}))
    metadata["total_features"] = len(enriched_features)

    return {
        "type": "FeatureCollection",
        "metadata": metadata,
        "features": enriched_features,
    }


@router.get("/parcels/{parcel_id}", status_code=status.HTTP_200_OK)
def get_gis_parcel_by_id(parcel_id: str, db: Session = Depends(get_db)):
    """Returns a single enriched GeoJSON feature by its spatial parcel_id."""
    dataset = load_spatial_dataset()
    for f in dataset.get("features", []):
        if _norm(f.get("properties", {}).get("parcel_id")) == _norm(parcel_id):
            parcels_lookup, owners_lookup = build_gis_lookups(db)
            return enrich_feature_with_record(f, parcels_lookup, owners_lookup)
    raise HTTPException(
        status_code=404,
        detail=f"Parcel '{parcel_id}' not found in spatial dataset.",
    )


@router.get("/khata/{khata_id}", status_code=status.HTTP_200_OK)
def get_gis_parcels_by_khata(khata_id: int, db: Session = Depends(get_db)):
    """
    Returns all spatial parcel features associated with a specific Khata ID
    (Entire Holding view). Used for the bi-directional Record → GIS deep link.
    """
    # Verify Khata exists
    khata = db.query(Khata).filter(Khata.id == khata_id).first()
    if not khata:
        raise HTTPException(
            status_code=404,
            detail=f"Khata record #{khata_id} not found.",
        )

    dataset = load_spatial_dataset()

    # Load lookups scoped to this khata_id only (minimizes memory & avoids unnecessary joins)
    parcels_lookup, owners_lookup = build_gis_lookups(db, target_khata_id=khata_id)

    holding_features = []
    for f in dataset.get("features", []):
        enriched = enrich_feature_with_record(
            f, parcels_lookup, owners_lookup, target_khata_id=khata_id
        )
        if enriched["properties"].get("khata_id") == khata_id:
            holding_features.append(enriched)

    # Total recorded area from DB parcels (authoritative, not from polygon geometry)
    db_parcels = db.query(KhataParcel).filter(KhataParcel.khata_id == khata_id).all()
    total_recorded_area = round(
        sum(float(p.area_hectare or 0) for p in db_parcels), 4
    )

    return {
        "type": "FeatureCollection",
        "khata_id": khata.id,
        "khata_number": khata.khata_number,
        "village": khata.village,
        "tehsil": khata.tehsil,
        "district": khata.district,
        "total_recorded_area_hectare": total_recorded_area,
        "total_parcels_in_holding": len(holding_features),
        "features": holding_features,
    }


@router.get("/hierarchy", status_code=status.HTTP_200_OK)
def get_administrative_hierarchy():
    """
    Returns the administrative hierarchy present in the cadastral spatial dataset.

    Response shape:
    {
      "hierarchy": {
        "<state_hi>": {
          "label_en": "<state_en>",
          "districts": {
            "<district_hi>": {
              "label_en": "<district_en>",
              "tehsils": {
                "<tehsil_hi>": {
                  "label_en": "<tehsil_en>",
                  "villages": ["<village_hi>", ...]
                }
              }
            }
          }
        }
      },
      // Flat lists retained for backward compatibility
      "states": [...],
      "districts": [...],
      "tehsils": [...],
      "villages": [...]
    }

    The nested 'hierarchy' tree is the authoritative source for cascading UI
    dropdowns. Flat lists remain for simpler downstream consumers.
    """
    dataset = load_spatial_dataset()
    features = dataset.get("features", [])

    # --- Build nested State -> District -> Tehsil -> Village tree ---
    tree: Dict[str, Any] = {}

    for f in features:
        p = f.get("properties", {})
        state_hi  = p.get("state", "")
        state_en  = p.get("state_en", "")
        dist_hi   = p.get("district", "")
        dist_en   = p.get("district_en", "")
        teh_hi    = p.get("tehsil", "")
        teh_en    = p.get("tehsil_en", "")
        vil_hi    = p.get("village", "")

        if not state_hi:
            continue

        if state_hi not in tree:
            tree[state_hi] = {"label_en": state_en, "districts": {}}
        state_node = tree[state_hi]

        if dist_hi and dist_hi not in state_node["districts"]:
            state_node["districts"][dist_hi] = {"label_en": dist_en, "tehsils": {}}

        if dist_hi:
            dist_node = state_node["districts"][dist_hi]

            if teh_hi and teh_hi not in dist_node["tehsils"]:
                dist_node["tehsils"][teh_hi] = {"label_en": teh_en, "villages": []}

            if teh_hi:
                teh_node = dist_node["tehsils"][teh_hi]
                if vil_hi and vil_hi not in teh_node["villages"]:
                    teh_node["villages"].append(vil_hi)

    # --- Flat lists (backward-compatible, sorted) ---
    states    = sorted({f["properties"].get("state")    for f in features if f["properties"].get("state")})
    districts = sorted({f["properties"].get("district") for f in features if f["properties"].get("district")})
    tehsils   = sorted({f["properties"].get("tehsil")   for f in features if f["properties"].get("tehsil")})
    villages  = sorted({f["properties"].get("village")  for f in features if f["properties"].get("village")})

    return {
        "hierarchy": tree,
        "states": states,
        "districts": districts,
        "tehsils": tehsils,
        "villages": villages,
    }

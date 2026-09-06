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
"""

import os
import json
import logging
import unicodedata
import re
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Khata, KhataParcel, KhataOwner

logger = logging.getLogger("app.api.gis")

router = APIRouter(prefix="/api/gis", tags=["GIS & Cadastral Map"])

# Path to cadastral demo GeoJSON
BASE_DIR = Path(__file__).resolve().parent.parent.parent
GEOJSON_PATH = BASE_DIR / "gis_data" / "cadastral_demo.geojson"

# In-memory cache for static GeoJSON
_GEOJSON_CACHE: Optional[dict] = None


def load_spatial_dataset() -> dict:
    """Loads and caches the cadastral demo GeoJSON dataset."""
    global _GEOJSON_CACHE
    if _GEOJSON_CACHE is None:
        if not GEOJSON_PATH.exists():
            logger.error(f"GeoJSON dataset not found at: {GEOJSON_PATH}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Cadastral spatial dataset not found on server."
            )
        with open(GEOJSON_PATH, "r", encoding="utf-8") as f:
            _GEOJSON_CACHE = json.load(f)
        logger.info(f"Loaded {len(_GEOJSON_CACHE.get('features', []))} cadastral features from {GEOJSON_PATH}")
    return _GEOJSON_CACHE


def _norm(val: Optional[str]) -> str:
    """
    Normalizes textual tokens for matching:
    - Strips Unicode ligatures / NFC normalization
    - Removes zero-width joiners
    - Deduplicates font-glitched matras
    - Removes '(S)' or other status annotations
    - Strips whitespace and lowercases Latin text
    """
    if not val:
        return ""
    text = unicodedata.normalize("NFC", str(val).strip())
    # Remove zero-width chars
    text = re.sub(r"[\u200b\u200c\u200d\ufeff]+", "", text)
    # Deduplicate consecutive vowel signs (e.g. 'पन्नाा' -> 'पन्ना')
    text = re.sub(r"([\u0901-\u0903\u093E-\u094D])\1+", r"\1", text)
    # Strip '(S)' or similar parcel flag
    text = re.sub(r"\s*\(S\)", "", text, flags=re.IGNORECASE)
    return text.strip().lower()


def _is_text_match(feature_val: Optional[str], feature_val_en: Optional[str], query_val: Optional[str]) -> bool:
    """Checks if a feature's Hindi or English value matches a query value."""
    if not query_val:
        return True
    q = _norm(query_val)
    f_hi = _norm(feature_val)
    f_en = _norm(feature_val_en)
    return (q in f_hi) or (q in f_en) or (f_hi in q) or (f_en in q)


def enrich_feature_with_record(feature: dict, db: Session, target_khata_id: Optional[int] = None) -> dict:
    """
    Enriches a spatial GeoJSON feature by cross-matching it against MySQL land records.
    Uses the 5-part prototype matching key:
        (state, district, tehsil, village, survey_no)

    Computes:
    - match_status: 'MATCHED' | 'UNMATCHED' | 'AMBIGUOUS'
    - khata_id (DB primary key integer)
    - khata_number (revenue string, e.g. '2305')
    - primary_owner
    - recorded_area_hectare
    - spatial_area_hectare: 'Not calculated'
    """
    props = dict(feature.get("properties", {}))
    feat_survey = _norm(props.get("survey_no"))
    feat_village = _norm(props.get("village"))
    feat_village_en = _norm(props.get("village_en"))
    feat_tehsil = _norm(props.get("tehsil"))
    feat_tehsil_en = _norm(props.get("tehsil_en"))
    feat_district = _norm(props.get("district"))
    feat_district_en = _norm(props.get("district_en"))
    feat_state = _norm(props.get("state"))
    feat_state_en = _norm(props.get("state_en"))

    # Query all parcels in MySQL with their parent Khata
    candidate_parcels = db.query(KhataParcel).join(Khata).all()

    matched_records: List[Dict[str, Any]] = []

    for p in candidate_parcels:
        k = p.khata
        if not k:
            continue

        # If a specific target_khata_id is requested, filter immediately
        if target_khata_id is not None and k.id != target_khata_id:
            continue

        p_survey = _norm(p.survey_number)
        k_village = _norm(k.village)
        k_tehsil = _norm(k.tehsil)
        k_district = _norm(k.district)
        k_state = _norm(k.state)

        # Survey number must match exactly
        if p_survey != feat_survey:
            continue

        # Village match (Hindi or English)
        if not (k_village == feat_village or k_village == feat_village_en or feat_village in k_village):
            continue

        # Tehsil match (if present)
        if k_tehsil and feat_tehsil and not (k_tehsil == feat_tehsil or k_tehsil == feat_tehsil_en or feat_tehsil in k_tehsil):
            continue

        # District match (if present)
        if k_district and feat_district and not (k_district == feat_district or k_district == feat_district_en or feat_district in k_district):
            continue

        # State match (if present)
        if k_state and feat_state and not (k_state == feat_state or k_state == feat_state_en or feat_state in k_state):
            continue

        # If we reached here, all 5 elements of the key matched
        primary_owner = ""
        first_owner = db.query(KhataOwner).filter(KhataOwner.khata_id == k.id).first()
        if first_owner:
            primary_owner = first_owner.owner_name or ""

        matched_records.append({
            "khata_id": k.id,
            "khata_number": k.khata_number,
            "record_id": k.id,
            "primary_owner": primary_owner,
            "recorded_area_hectare": p.area_hectare,
            "land_use_flag": p.land_use_flag,
            "parcel_unique_id": p.parcel_unique_id,
            "review_status": k.review_status.value if hasattr(k.review_status, "value") else str(k.review_status),
            "is_duplicate_flag": k.is_duplicate_flag,
        })

    # Deduplicate matches by khata_id
    unique_khatas = {m["khata_id"]: m for m in matched_records}

    if len(unique_khatas) == 1:
        match_info = list(unique_khatas.values())[0]
        props["match_status"] = "MATCHED"
        props["khata_id"] = match_info["khata_id"]
        props["khata_number"] = match_info["khata_number"]
        props["record_id"] = match_info["record_id"]
        props["primary_owner"] = match_info["primary_owner"]
        props["recorded_area_hectare"] = match_info["recorded_area_hectare"]
        props["parcel_unique_id"] = match_info["parcel_unique_id"]
        props["review_status"] = match_info["review_status"]
        props["is_duplicate_flag"] = match_info["is_duplicate_flag"]
    elif len(unique_khatas) > 1:
        # Check if they all belong to the SAME revenue Khata Number (e.g. duplicate uploads in DB)
        distinct_khata_numbers = {m["khata_number"] for m in unique_khatas.values() if m.get("khata_number")}
        if len(distinct_khata_numbers) == 1:
            # All matches are of the same Khata Number (e.g. 2305). Select the verified or first one.
            chosen = next((m for m in unique_khatas.values() if m["review_status"] == "verified"), list(unique_khatas.values())[0])
            props["match_status"] = "MATCHED"
            props["khata_id"] = chosen["khata_id"]
            props["khata_number"] = chosen["khata_number"]
            props["record_id"] = chosen["record_id"]
            props["primary_owner"] = chosen["primary_owner"]
            props["recorded_area_hectare"] = chosen["recorded_area_hectare"]
            props["parcel_unique_id"] = chosen["parcel_unique_id"]
            props["review_status"] = chosen["review_status"]
            props["is_duplicate_flag"] = True
            props["duplicate_records_count"] = len(unique_khatas)
        else:
            # Genuinely ambiguous: multiple different Khata numbers claim this parcel
            props["match_status"] = "AMBIGUOUS"
            props["khata_id"] = None
            props["khata_number"] = None
            props["record_id"] = None
            props["ambiguous_matches_count"] = len(unique_khatas)
            props["ambiguous_khatas"] = list(distinct_khata_numbers)
    else:
        props["match_status"] = "UNMATCHED"
        props["khata_id"] = None
        props["khata_number"] = None
        props["record_id"] = None

    # Spatial geometry area rule: Explicitly 'Not calculated' per GIS_guide.md Section 33
    props["spatial_area_hectare"] = "Not calculated"
    props["geometry_status"] = "DEMO"
    props["source_type"] = "prototype"
    props["authoritative"] = False
    props["disclaimer"] = "Prototype polygons using survey numbers from the sample land records; geometry is synthetic/demo geometry."

    return {
        "type": "Feature",
        "id": feature.get("id"),
        "properties": props,
        "geometry": feature.get("geometry")
    }


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------

@router.get("/parcels", status_code=status.HTTP_200_OK)
def list_gis_parcels(
    state: Optional[str] = Query(None, description="Filter by state"),
    district: Optional[str] = Query(None, description="Filter by district"),
    tehsil: Optional[str] = Query(None, description="Filter by tehsil"),
    village: Optional[str] = Query(None, description="Filter by village"),
    survey_no: Optional[str] = Query(None, description="Filter by survey / khasra number"),
    khata_id: Optional[int] = Query(None, description="Filter by database Khata ID (PK)"),
    khata_number: Optional[str] = Query(None, description="Filter by official Khata number"),
    parcel_id: Optional[str] = Query(None, description="Filter by spatial parcel ID"),
    q: Optional[str] = Query(None, description="General search query across survey, parcel ID, khata, or village"),
    db: Session = Depends(get_db)
):
    """
    Returns a GeoJSON FeatureCollection of cadastral parcels with runtime land-record integration.
    Filters by administrative hierarchy, survey number, khata_id, khata_number, or general query.
    """
    dataset = load_spatial_dataset()
    raw_features = dataset.get("features", [])

    enriched_features = []

    for f in raw_features:
        props = f.get("properties", {})

        # 1. Direct Spatial Filters
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

        # 2. Enrich feature with MySQL record data
        enriched = enrich_feature_with_record(f, db, target_khata_id=khata_id)
        e_props = enriched["properties"]

        # 3. Post-enrichment filters (Khata ID / Khata Number)
        if khata_id is not None and e_props.get("khata_id") != khata_id:
            continue
        if khata_number and _norm(khata_number) != _norm(e_props.get("khata_number")):
            continue

        # 4. General search query (q)
        if q:
            q_norm = _norm(q)
            s_no = _norm(e_props.get("survey_no"))
            p_id = _norm(e_props.get("parcel_id"))
            k_no = _norm(e_props.get("khata_number"))
            vil_hi = _norm(e_props.get("village"))
            vil_en = _norm(e_props.get("village_en"))
            owner = _norm(e_props.get("primary_owner"))

            matches_q = (
                q_norm in s_no or s_no in q_norm or
                q_norm in p_id or
                (k_no and (q_norm in k_no or k_no in q_norm)) or
                q_norm in vil_hi or q_norm in vil_en or
                q_norm in owner
            )
            if not matches_q:
                continue

        enriched_features.append(enriched)

    metadata = dict(dataset.get("metadata", {}))
    metadata["total_features"] = len(enriched_features)

    return {
        "type": "FeatureCollection",
        "metadata": metadata,
        "features": enriched_features
    }


@router.get("/parcels/{parcel_id}", status_code=status.HTTP_200_OK)
def get_gis_parcel_by_id(parcel_id: str, db: Session = Depends(get_db)):
    """Returns a single GeoJSON feature by its parcel_id."""
    dataset = load_spatial_dataset()
    for f in dataset.get("features", []):
        if _norm(f.get("properties", {}).get("parcel_id")) == _norm(parcel_id):
            return enrich_feature_with_record(f, db)
    raise HTTPException(status_code=404, detail=f"Parcel '{parcel_id}' not found in spatial dataset.")


@router.get("/khata/{khata_id}", status_code=status.HTTP_200_OK)
def get_gis_parcels_by_khata(khata_id: int, db: Session = Depends(get_db)):
    """
    Returns all spatial parcel features associated with a specific Khata ID (Entire Holding).
    """
    # Verify Khata exists in database
    khata = db.query(Khata).filter(Khata.id == khata_id).first()
    if not khata:
        raise HTTPException(status_code=404, detail=f"Khata record #{khata_id} not found.")

    dataset = load_spatial_dataset()
    holding_features = []

    for f in dataset.get("features", []):
        enriched = enrich_feature_with_record(f, db, target_khata_id=khata_id)
        if enriched["properties"].get("khata_id") == khata_id:
            holding_features.append(enriched)

    # Calculate recorded area total from database parcels
    db_parcels = db.query(KhataParcel).filter(KhataParcel.khata_id == khata_id).all()
    total_recorded_area = round(sum(float(p.area_hectare or 0) for p in db_parcels), 4)

    return {
        "type": "FeatureCollection",
        "khata_id": khata.id,
        "khata_number": khata.khata_number,
        "village": khata.village,
        "tehsil": khata.tehsil,
        "district": khata.district,
        "total_recorded_area_hectare": total_recorded_area,
        "total_parcels_in_holding": len(holding_features),
        "features": holding_features
    }


@router.get("/hierarchy", status_code=status.HTTP_200_OK)
def get_administrative_hierarchy():
    """
    Returns available administrative levels (States -> Districts -> Tehsils -> Villages)
    present in the cadastral spatial dataset to populate cascading filter dropdowns.
    """
    dataset = load_spatial_dataset()
    features = dataset.get("features", [])

    states = sorted(list({f["properties"].get("state") for f in features if f["properties"].get("state")}))
    districts = sorted(list({f["properties"].get("district") for f in features if f["properties"].get("district")}))
    tehsils = sorted(list({f["properties"].get("tehsil") for f in features if f["properties"].get("tehsil")}))
    villages = sorted(list({f["properties"].get("village") for f in features if f["properties"].get("village")}))

    return {
        "states": states,
        "districts": districts,
        "tehsils": tehsils,
        "villages": villages
    }

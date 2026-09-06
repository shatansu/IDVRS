"""
Phase 5 — POST /api/records endpoint
======================================
Accepts the final (possibly user-corrected) structured data from the
frontend Review page and persists it to MySQL:
  - khatas table (one row)
  - khata_owners table (one row per owner)
  - khata_parcels table (one row per parcel)

Request body shape:
  {
    "document_id": 5,
    "khata": { "clrm_no": "...", "khata_number": "2305", "village": "...", ... },
    "owners": [{ "owner_name": "...", "share_fraction": "1/3", ... }],
    "parcels": [{ "survey_number": "96/1 (S)", "area_hectare": 0.107, ... }],
    "validation": { "is_duplicate": false, ... }
  }

Each field value in 'khata' can be either:
  - A plain string/number (if user edited it)
  - A confidence-wrapped object { "value": "...", "confidence": 0.94 }
  (Both formats accepted for robustness)
"""

import logging
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Khata, KhataOwner, KhataParcel, Document

logger = logging.getLogger("app.api.records")

router = APIRouter(prefix="/api", tags=["Records"])


# ---------------------------------------------------------------------------
# Pydantic models for the incoming payload
# ---------------------------------------------------------------------------

class OwnerIn(BaseModel):
    owner_name: Optional[str] = None
    parent_or_spouse_name: Optional[str] = None
    address: Optional[str] = None
    share_fraction: Optional[str] = None
    ownership_status: Optional[str] = None
    owner_id_no: Optional[str] = None


class ParcelIn(BaseModel):
    parcel_unique_id: Optional[str] = None
    survey_number: Optional[str] = None
    land_use_flag: Optional[str] = None
    area_hectare: Optional[float] = None
    land_use: Optional[str] = None
    land_revenue_rs: Optional[float] = None


class ValidationIn(BaseModel):
    passed: Optional[bool] = True
    is_duplicate: Optional[bool] = False
    errors: Optional[list] = []
    warnings: Optional[list] = []
    duplicate_matches: Optional[list] = []


class RecordIn(BaseModel):
    document_id: Optional[int] = None
    khata: dict[str, Any]          # values may be plain or confidence-wrapped
    owners: list[OwnerIn] = []
    parcels: list[ParcelIn] = []
    validation: Optional[ValidationIn] = None


# ---------------------------------------------------------------------------
# Helper: unwrap confidence-wrapped or plain field value
# ---------------------------------------------------------------------------

def _unwrap(val: Any) -> Any:
    """
    Accepts either:
      - { "value": "...", "confidence": 0.94 }  → returns "..."
      - "plain string"                            → returns as-is
      - None                                      → returns None
    """
    if isinstance(val, dict):
        return val.get("value")
    return val


def _unwrap_float(val: Any) -> Optional[float]:
    v = _unwrap(val)
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/records", status_code=status.HTTP_201_CREATED)
def save_record(payload: RecordIn, db: Session = Depends(get_db)):
    """
    Saves the final (user-reviewed and possibly corrected) land record to MySQL.
    Creates one Khata, N KhataOwner rows, and M KhataParcel rows.
    Sets is_duplicate_flag if validation indicates a duplicate.
    """
    khata_d = payload.khata
    is_dup  = payload.validation.is_duplicate if payload.validation else False

    # Build Khata row
    khata_row = Khata(
        document_id             = payload.document_id,
        clrm_no                 = _unwrap(khata_d.get("clrm_no")),
        khata_number            = _unwrap(khata_d.get("khata_number")),
        village                 = _unwrap(khata_d.get("village")),
        tehsil                  = _unwrap(khata_d.get("tehsil")),
        district                = _unwrap(khata_d.get("district")),
        state                   = _unwrap(khata_d.get("state")),
        fasli_year              = _unwrap(khata_d.get("fasli_year")),
        patwari_halka_no        = _unwrap(khata_d.get("patwari_halka_no")),
        is_duplicate_flag       = is_dup,
        # Confidence values (may or may not be present after user edit)
        clrm_no_confidence      = _unwrap_float(
            khata_d.get("clrm_no", {}).get("confidence") if isinstance(khata_d.get("clrm_no"), dict) else None
        ),
        khata_number_confidence = _unwrap_float(
            khata_d.get("khata_number", {}).get("confidence") if isinstance(khata_d.get("khata_number"), dict) else None
        ),
        village_confidence      = _unwrap_float(
            khata_d.get("village", {}).get("confidence") if isinstance(khata_d.get("village"), dict) else None
        ),
        tehsil_confidence       = _unwrap_float(
            khata_d.get("tehsil", {}).get("confidence") if isinstance(khata_d.get("tehsil"), dict) else None
        ),
        district_confidence     = _unwrap_float(
            khata_d.get("district", {}).get("confidence") if isinstance(khata_d.get("district"), dict) else None
        ),
    )
    db.add(khata_row)
    db.flush()  # get khata_row.id

    # Build KhataOwner rows
    owners_saved = 0
    for o in payload.owners:
        db.add(KhataOwner(
            khata_id              = khata_row.id,
            owner_name            = o.owner_name,
            parent_or_spouse_name = o.parent_or_spouse_name,
            address               = o.address,
            share_fraction        = o.share_fraction,
            ownership_status      = o.ownership_status,
            owner_id_no           = o.owner_id_no,
        ))
        owners_saved += 1

    # Build KhataParcel rows
    parcels_saved = 0
    for p in payload.parcels:
        db.add(KhataParcel(
            khata_id         = khata_row.id,
            parcel_unique_id = p.parcel_unique_id,
            survey_number    = p.survey_number,
            land_use_flag    = p.land_use_flag,
            area_hectare     = p.area_hectare,
            land_use         = p.land_use,
            land_revenue_rs  = p.land_revenue_rs,
        ))
        parcels_saved += 1

    db.commit()
    db.refresh(khata_row)

    logger.info(
        f"Record saved: khata_id={khata_row.id}, document_id={payload.document_id}, "
        f"owners={owners_saved}, parcels={parcels_saved}, is_duplicate={is_dup}"
    )

    return {
        "record_id":     khata_row.id,
        "khata_id":      khata_row.id,
        "document_id":   payload.document_id,
        "owners_saved":  owners_saved,
        "parcels_saved": parcels_saved,
        "is_duplicate":  is_dup,
        "message":       "Record saved successfully."
    }


@router.delete("/records/{record_id}", status_code=status.HTTP_200_OK)
def delete_record(record_id: int, db: Session = Depends(get_db)):
    """Deletes a single khata record and cascades to its owners and parcels."""
    khata = db.query(Khata).filter(Khata.id == record_id).first()
    if not khata:
        raise HTTPException(status_code=404, detail=f"Record #{record_id} not found.")
    db.delete(khata)
    db.commit()
    logger.info(f"Record #{record_id} deleted successfully.")
    return {"message": f"Record #{record_id} deleted successfully.", "deleted_id": record_id}


@router.delete("/records", status_code=status.HTTP_200_OK)
def reset_all_records(confirm: bool = False, db: Session = Depends(get_db)):
    """Deletes all saved khatas and documents if confirm=True."""
    if not confirm:
        raise HTTPException(status_code=400, detail="Must provide ?confirm=true to wipe records.")
    deleted_khatas = db.query(Khata).delete()
    deleted_docs = db.query(Document).delete()
    db.commit()
    logger.info(f"Wiped all records: {deleted_khatas} khatas, {deleted_docs} documents.")
    return {
        "message": "All records purged successfully.",
        "deleted_khatas": deleted_khatas,
        "deleted_docs": deleted_docs
    }

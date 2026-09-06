"""
Phase 6 — Records List & Dashboard Endpoints
=============================================

GET /api/records
    Returns paginated list of all saved khatas with owner/parcel counts.

GET /api/records/{id}
    Returns full detail of a single khata: khata fields + all owners + all parcels.

GET /api/dashboard/stats
    Returns aggregate statistics for the dashboard:
      - total_documents:     total rows in documents table
      - total_khatas:        total rows in khatas table
      - average_confidence:  average of khata_number_confidence across all khatas
      - pending_review_count: khatas where review_status = 'pending_review'
      - duplicate_count:     khatas where is_duplicate_flag = True
      - records_by_district: list of {district, count} for bar chart
      - records_by_review_status: list of {status, count} for pie chart
"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, case

from app.database import get_db
from app.models import Khata, KhataOwner, KhataParcel, Document, ReviewStatusEnum

logger = logging.getLogger("app.api.dashboard")

router = APIRouter(prefix="/api", tags=["Records & Dashboard"])


# ---------------------------------------------------------------------------
# GET /api/records  — list all khatas
# ---------------------------------------------------------------------------

@router.get("/records", status_code=status.HTTP_200_OK)
def list_records(
    village: Optional[str] = Query(None, description="Filter by village (partial match)"),
    district: Optional[str] = Query(None, description="Filter by district (partial match)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """
    Returns all saved khatas with owner and parcel counts.
    Supports optional filtering by village/district (case-insensitive partial match).
    """
    query = db.query(Khata)

    if village:
        query = query.filter(Khata.village.ilike(f"%{village}%"))
    if district:
        query = query.filter(Khata.district.ilike(f"%{district}%"))

    total = query.count()
    khatas = query.order_by(Khata.created_at.desc()).offset(skip).limit(limit).all()

    results = []
    for k in khatas:
        results.append({
            "id":               k.id,
            "document_id":      k.document_id,
            "clrm_no":          k.clrm_no,
            "khata_number":     k.khata_number,
            "village":          k.village,
            "tehsil":           k.tehsil,
            "district":         k.district,
            "state":            k.state,
            "fasli_year":       k.fasli_year,
            "review_status":    k.review_status.value,
            "is_duplicate_flag": k.is_duplicate_flag,
            "owner_count":      len(k.owners),
            "parcel_count":     len(k.parcels),
            "created_at":       k.created_at.isoformat() if k.created_at else None,
            # First owner name for quick preview
            "primary_owner":    k.owners[0].owner_name if k.owners else None,
        })

    return {
        "total": total,
        "skip":  skip,
        "limit": limit,
        "records": results,
    }


# ---------------------------------------------------------------------------
# GET /api/records/{id}  — full detail of a single khata
# ---------------------------------------------------------------------------

@router.get("/records/{record_id}", status_code=status.HTTP_200_OK)
def get_record_detail(record_id: int, db: Session = Depends(get_db)):
    """
    Returns full khata detail including all owners and parcels.
    """
    khata = db.query(Khata).filter(Khata.id == record_id).first()
    if not khata:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Record with id={record_id} not found."
        )

    # Fetch linked document filename if available
    doc = db.query(Document).filter(Document.id == khata.document_id).first()

    owners = [
        {
            "id":                   o.id,
            "owner_name":           o.owner_name,
            "parent_or_spouse_name": o.parent_or_spouse_name,
            "address":              o.address,
            "share_fraction":       o.share_fraction,
            "ownership_status":     o.ownership_status,
            "owner_id_no":          o.owner_id_no,
        }
        for o in khata.owners
    ]

    parcels = [
        {
            "id":              p.id,
            "parcel_unique_id": p.parcel_unique_id,
            "survey_number":   p.survey_number,
            "land_use_flag":   p.land_use_flag,
            "area_hectare":    float(p.area_hectare) if p.area_hectare is not None else None,
            "land_use":        p.land_use,
            "land_revenue_rs": float(p.land_revenue_rs) if p.land_revenue_rs is not None else None,
        }
        for p in khata.parcels
    ]

    return {
        "id":               khata.id,
        "document_id":      khata.document_id,
        "document_filename": doc.original_filename if doc else None,
        "clrm_no":          khata.clrm_no,
        "khata_number":     khata.khata_number,
        "village":          khata.village,
        "tehsil":           khata.tehsil,
        "district":         khata.district,
        "state":            khata.state,
        "fasli_year":       khata.fasli_year,
        "patwari_halka_no": khata.patwari_halka_no,
        "review_status":    khata.review_status.value,
        "is_duplicate_flag": khata.is_duplicate_flag,
        "created_at":       khata.created_at.isoformat() if khata.created_at else None,
        "owners":           owners,
        "parcels":          parcels,
    }


# ---------------------------------------------------------------------------
# PATCH /api/records/{id}/status  — update review status
# ---------------------------------------------------------------------------

@router.patch("/records/{record_id}/status", status_code=status.HTTP_200_OK)
def update_record_status(
    record_id: int,
    body: dict,
    db: Session = Depends(get_db),
):
    """
    Updates the review_status of a khata record.
    Body: { "review_status": "verified" | "pending_review" }
    """
    khata = db.query(Khata).filter(Khata.id == record_id).first()
    if not khata:
        raise HTTPException(status_code=404, detail=f"Record {record_id} not found.")

    new_status = body.get("review_status")
    if new_status not in ("verified", "pending_review"):
        raise HTTPException(status_code=400, detail="review_status must be 'verified' or 'pending_review'.")

    khata.review_status = ReviewStatusEnum(new_status)
    db.commit()
    db.refresh(khata)

    return {
        "id":            khata.id,
        "review_status": khata.review_status.value,
        "message":       f"Record {record_id} status updated to '{new_status}'."
    }


# ---------------------------------------------------------------------------
# GET /api/dashboard/stats  — aggregate stats
# ---------------------------------------------------------------------------

@router.get("/dashboard/stats", status_code=status.HTTP_200_OK)
def get_dashboard_stats(db: Session = Depends(get_db)):
    """
    Returns aggregate statistics for the dashboard page.
    """
    total_documents = db.query(func.count(Document.id)).scalar() or 0
    total_khatas    = db.query(func.count(Khata.id)).scalar() or 0

    # Average confidence: average of all non-null khata_number_confidence values
    avg_conf_raw = db.query(func.avg(Khata.khata_number_confidence)).scalar()
    average_confidence = round(float(avg_conf_raw) * 100, 1) if avg_conf_raw else 0.0

    pending_review_count = db.query(func.count(Khata.id)).filter(
        Khata.review_status == ReviewStatusEnum.pending_review
    ).scalar() or 0

    duplicate_count = db.query(func.count(Khata.id)).filter(
        Khata.is_duplicate_flag == True
    ).scalar() or 0

    verified_count = db.query(func.count(Khata.id)).filter(
        Khata.review_status == ReviewStatusEnum.verified
    ).scalar() or 0

    # Records by district (for bar chart) — group non-null districts
    import re
    doubled_matra_re = re.compile(r"([\u0901-\u0903\u093E-\u094D])\1+")

    district_rows = (
        db.query(Khata.district, func.count(Khata.id).label("count"))
        .filter(Khata.district.isnot(None))
        .filter(Khata.district != "")
        .group_by(Khata.district)
        .order_by(func.count(Khata.id).desc())
        .all()
    )
    district_counts: dict[str, int] = {}
    for row in district_rows:
        if row.district:
            clean_dist = doubled_matra_re.sub(r"\1", row.district.strip())
            district_counts[clean_dist] = district_counts.get(clean_dist, 0) + row.count

    records_by_district = [
        {"district": dist, "count": count}
        for dist, count in sorted(district_counts.items(), key=lambda x: x[1], reverse=True)
    ]

    # Review status breakdown (for pie chart)
    records_by_review_status = [
        {"status": "Verified",       "count": verified_count},
        {"status": "Pending Review", "count": pending_review_count},
    ]

    return {
        "total_documents":          total_documents,
        "total_khatas":             total_khatas,
        "average_confidence":       average_confidence,
        "pending_review_count":     pending_review_count,
        "duplicate_count":          duplicate_count,
        "verified_count":           verified_count,
        "records_by_district":      records_by_district,
        "records_by_review_status": records_by_review_status,
    }

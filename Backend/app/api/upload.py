import os
import uuid
import logging
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Document, SourceModeEnum, ProcessingStatusEnum
from app.pipeline.extractor import extract_document
from app.config import BASE_DIR

logger = logging.getLogger("app.api.upload")

router = APIRouter(prefix="/api", tags=["Document Processing"])

# Ensure uploads directory exists
UPLOADS_DIR = BASE_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".webp"}

def infer_document_type(text: str) -> str:
    """
    Identifies document type based on key heading phrases in Hindi.
    """
    if not text:
        return "other"
    if "भू-अधिकार" in text or "अधिकार पुस्तिका" in text or "प्रारूप-4" in text or "प्रारूप 4" in text:
        return "bhu_adhikar_pustika"
    if "खतौनी" in text or "प्रारूप-7" in text or "प्रारूप 7" in text or "बी-1" in text:
        return "khatoni_b1"
    return "other"

@router.post("/upload", status_code=status.HTTP_200_OK)
async def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Uploads a land record document (PDF/image), detects whether it is a
    digital-native PDF or scanned file, runs text extraction, saves the record
    to the MySQL database, and returns the raw extracted text with metadata.
    """
    filename = file.filename or "uploaded_document"
    ext = Path(filename).suffix.lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{ext}'. Allowed extensions: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    # Generate unique storage filename
    unique_filename = f"{uuid.uuid4().hex[:10]}_{filename}"
    saved_path = UPLOADS_DIR / unique_filename

    try:
        # Save file to disk
        contents = await file.read()
        with open(saved_path, "wb") as f:
            f.write(contents)
        logger.info(f"Saved uploaded file to {saved_path} ({len(contents)} bytes)")

        # Run extraction pipeline
        extraction_result = extract_document(str(saved_path))
        doc_type = infer_document_type(extraction_result["full_text"])

        # Persist document metadata and raw extracted text to MySQL
        source_mode_val = SourceModeEnum.digital_text if extraction_result["source_mode"] == "digital_text" else SourceModeEnum.ocr

        doc_record = Document(
            original_filename=filename,
            file_path=str(saved_path),
            document_type=doc_type,
            source_mode=source_mode_val,
            raw_extracted_text=extraction_result["full_text"],
            processing_status=ProcessingStatusEnum.completed
        )
        db.add(doc_record)
        db.commit()
        db.refresh(doc_record)

        logger.info(f"Document saved to DB with ID={doc_record.id}, source_mode={doc_record.source_mode.value}")

        return {
            "document_id": doc_record.id,
            "original_filename": filename,
            "document_type": doc_type,
            "source_mode": extraction_result["source_mode"],
            "page_count": extraction_result["page_count"],
            "character_count": extraction_result["character_count"],
            "average_confidence": extraction_result["average_confidence"],
            "raw_text": extraction_result["full_text"],
            "page_texts": extraction_result["page_texts"],
            "processing_status": doc_record.processing_status.value
        }

    except Exception as exc:
        logger.error(f"Error processing uploaded document: {exc}", exc_info=True)
        # Attempt to record failed state in database if possible
        try:
            failed_doc = Document(
                original_filename=filename,
                file_path=str(saved_path) if saved_path.exists() else None,
                document_type="other",
                source_mode=SourceModeEnum.ocr,
                raw_extracted_text=f"Extraction failed: {str(exc)}",
                processing_status=ProcessingStatusEnum.failed
            )
            db.add(failed_doc)
            db.commit()
        except Exception:
            pass

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Extraction failed: {str(exc)}"
        )

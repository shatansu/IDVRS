import os
import uuid
import logging
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Document, SourceModeEnum, ProcessingStatusEnum
from app.pipeline.extractor import extract_document
from app.pipeline.field_extractor import extract_fields
from app.pipeline.validator import validate_extraction
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
    digital-native PDF or scanned file, runs text extraction, field extraction
    (Phase 3), validation rules (Phase 4), saves the document record to MySQL,
    and returns the full structured result including validation warnings.
    """
    filename = file.filename or "uploaded_document"
    ext = Path(filename).suffix.lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"अमान्य फ़ाइल प्रकार '{ext}'। केवल PDF, JPG, PNG, TIFF, BMP, WEBP समर्थित हैं। / Unsupported file type '{ext}'. Allowed extensions: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    # Generate unique storage filename
    unique_filename = f"{uuid.uuid4().hex[:10]}_{filename}"
    saved_path = UPLOADS_DIR / unique_filename

    try:
        # Save file to disk
        contents = await file.read()

        # Check for empty file (0 bytes)
        if len(contents) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="अपलोड की गई फ़ाइल खाली है (0 बाइट्स)। कृपया एक वैध भूमि रिकॉर्ड दस्तावेज़ अपलोड करें। / The uploaded file is empty (0 bytes). Please upload a valid document."
            )

        # Check for size limit (50 MB)
        if len(contents) > 50 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="फ़ाइल का आकार 50MB की अधिकतम सीमा से अधिक है। / File size exceeds the maximum limit of 50MB."
            )

        with open(saved_path, "wb") as f:
            f.write(contents)
        logger.info(f"Saved uploaded file to {saved_path} ({len(contents)} bytes)")

        # Run extraction pipeline
        try:
            extraction_result = extract_document(str(saved_path))
        except Exception as extract_err:
            logger.error(f"Extraction failed for {saved_path}: {extract_err}")
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"फ़ाइल को पढ़ा या प्रोसेस नहीं किया जा सका (संभवतः दूषित या अव्यवहार्य प्रारूप)। / Could not parse or process the file (file may be corrupted or invalid): {str(extract_err)}"
            )

        # Check for empty text extraction
        extracted_text = extraction_result.get("full_text", "").strip()
        if not extracted_text:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="दस्तावेज़ से कोई पठनीय पाठ नहीं मिला। कृपया सुनिश्चित करें कि दस्तावेज़ स्पष्ट है और रिक्त नहीं है। / No readable text could be extracted from this document. Please verify the document is legible and not blank."
            )

        doc_type = infer_document_type(extraction_result["full_text"])

        # Phase 3: Run field extraction (regex + rule-based)
        structured_data = extract_fields(extraction_result["full_text"], doc_type)

        # Phase 4: Run validation rules (including DB duplicate check)
        validation_result = validate_extraction(structured_data, db)
        # Attach validation to structured_data so it travels together
        structured_data["validation"] = validation_result

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

        logger.info(
            f"Document saved to DB with ID={doc_record.id}, "
            f"source_mode={doc_record.source_mode.value}, "
            f"validation_passed={validation_result['passed']}, "
            f"is_duplicate={validation_result['is_duplicate']}"
        )

        return {
            "document_id": doc_record.id,
            "original_filename": filename,
            "document_type": doc_type,
            "source_mode": extraction_result["source_mode"],
            "classification": extraction_result.get("classification", "printed"),
            "engine_used": extraction_result.get("engine_used", "pymupdf"),
            "page_count": extraction_result["page_count"],
            "character_count": extraction_result["character_count"],
            "average_confidence": extraction_result["average_confidence"],
            "raw_text": extraction_result["full_text"],
            "page_texts": extraction_result["page_texts"],
            "evidence": extraction_result.get("evidence", []),
            "file_path": str(saved_path),
            "processing_status": doc_record.processing_status.value,
            # Phase 3+4: structured extraction + validation result
            "structured_data": structured_data,
        }

    except HTTPException:
        # Re-raise HTTP exceptions directly so proper status code & message reach the client
        raise
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
            detail=f"दस्तावेज़ प्रसंस्करण में तकनीकी त्रुटि: {str(exc)} / Processing error: {str(exc)}"
        )

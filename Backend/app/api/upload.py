import os
import uuid
import logging
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Document, SourceModeEnum, ProcessingStatusEnum
from app.pipeline.detector import detect_document_source
from app.pipeline.extractor import extract_document
from app.pipeline.field_extractor import extract_fields
from app.pipeline.validator import validate_extraction
from app.pipeline.gemini_vision_adapter import extract_handwritten_with_gemini, get_gemini_api_key
from app.config import BASE_DIR

from typing import List

logger = logging.getLogger("app.api.upload")

router = APIRouter(prefix="/api", tags=["Document Processing"])

# Ensure uploads directory exists
UPLOADS_DIR = BASE_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".webp"}

def infer_document_type(text: str) -> str:
    """
    Identifies document type based on key heading phrases in Hindi and English.
    """
    if not text:
        return "other"
    lower_text = text.lower()
    if (
        "भू-अधिकार" in text or "अधिकार पुस्तिका" in text or "प्रारूप-4" in text or "प्रारूप 4" in text
        or "form four" in lower_text or "form 4" in lower_text or "land rights" in lower_text
    ):
        return "bhu_adhikar_pustika"
    if (
        "खतौनी" in text or "प्रारूप-7" in text or "प्रारूप 7" in text or "बी-1" in text
        or "khatoni" in lower_text or "form seven" in lower_text or "form 7" in lower_text or "b-1" in lower_text
    ):
        return "khatoni_b1"
    if any(k in text for k in [
        "प्रतिलिपि", "सत्य प्रतिलिपि", "नामांतरण", "नामान्तरण", "पंजी",
        "राजस्व", "तहसीलदार", "तिलतिप्ी", "तिलिपी", "प्रदर्श"
    ]) or any(k in lower_text for k in ["certified copy", "revenue register", "mutation", "namantaran", "land record"]):
        return "revenue_register"
    return "other"


def _process_single_file_content(contents: bytes, filename: str, db: Session) -> dict:
    """
    Core pipeline worker for processing a single land record file's byte contents.
    Validates, extracts via OCR/Gemini, parses fields, runs validation rules, and saves to MySQL.
    """
    ext = Path(filename).suffix.lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"अमान्य फ़ाइल प्रकार '{ext}'। केवल PDF, JPG, PNG, TIFF, BMP, WEBP समर्थित हैं। / Unsupported file type '{ext}'. Allowed extensions: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    if len(contents) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="अपलोड की गई फ़ाइल खाली है (0 बाइट्स)। कृपया एक वैध भूमि रिकॉर्ड दस्तावेज़ अपलोड करें। / The uploaded file is empty (0 bytes). Please upload a valid document."
        )

    if len(contents) > 50 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="फ़ाइल का आकार 50MB की अधिकतम सीमा से अधिक है। / File size exceeds the maximum limit of 50MB."
        )

    # Generate unique storage filename
    unique_filename = f"{uuid.uuid4().hex[:10]}_{filename}"
    saved_path = UPLOADS_DIR / unique_filename

    with open(saved_path, "wb") as f:
        f.write(contents)
    logger.info(f"Saved uploaded file to {saved_path} ({len(contents)} bytes)")

    try:
        # Step 1: Detect document source and classification
        source_mode, page_count, classification = detect_document_source(str(saved_path))
        logger.info(
            f"Uploaded document {saved_path.name}: source_mode={source_mode}, "
            f"page_count={page_count}, classification={classification}"
        )

        gemini_structured = None
        # Rule: Use Gemini ONLY for handwritten images and handwritten/scanned PDFs related to lands
        # Printed digital PDFs (e.g. Form 4 Bhu-Adhikar Pustika, Form 7 Khatoni B-1) strictly use PyMuPDF
        is_handwritten_candidate = (
            ext != ".pdf" or classification in {"handwritten", "mixed"}
        ) and source_mode != "digital_text"

        if is_handwritten_candidate:
            api_key = get_gemini_api_key()
            if api_key:
                try:
                    logger.info(f"Invoking Gemini Vision for handwritten/image document: {saved_path.name}")
                    gemini_structured = extract_handwritten_with_gemini(str(saved_path), api_key=api_key)
                except Exception as g_err:
                    logger.warning(
                        f"Gemini Vision extraction encountered an issue: {g_err}. "
                        "Falling back to local extraction pipeline."
                    )
            else:
                logger.warning("No Gemini API key available. Falling back to local OCR pipeline.")

        if gemini_structured:
            structured_data = gemini_structured
            extracted_text = gemini_structured.get("full_text", "").strip()
            if not extracted_text:
                extracted_text = "Handwritten document scanned via Gemini Vision."
            raw_doc_type = gemini_structured.get("extraction_meta", {}).get("document_type") or infer_document_type(extracted_text)
            doc_type = str(raw_doc_type)[:250] if raw_doc_type else "other"
            avg_conf = gemini_structured.get("extraction_meta", {}).get("average_confidence", 0.94)

            extraction_result = {
                "source_mode": "ocr",
                "classification": classification,
                "engine_used": "bhu_setu_neural_vision",
                "page_count": page_count,
                "character_count": len(extracted_text),
                "average_confidence": avg_conf,
                "full_text": extracted_text,
                "page_texts": [{"page_number": 1, "character_count": len(extracted_text), "confidence": avg_conf, "text": extracted_text}],
                "evidence": []
            }
        else:
            # Printed documents (digital PDFs / printed scans) or fallback mode
            try:
                extraction_result = extract_document(str(saved_path))
            except Exception as extract_err:
                logger.error(f"Extraction failed for {saved_path}: {extract_err}")
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"फ़ाइल को पढ़ा या प्रोसेस नहीं किया जा सका (संभवतः दूषित या अव्यवहार्य प्रारूप)। / Could not parse or process the file (file may be corrupted or invalid): {str(extract_err)}"
                )

            extracted_text = extraction_result.get("full_text", "").strip()
            if not extracted_text:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="दस्तावेज़ से कोई पठनीय पाठ नहीं मिला। कृपया सुनिश्चित करें कि दस्तावेज़ स्पष्ट है और रिक्त नहीं है। / No readable text could be extracted from this document. Please verify the document is legible and not blank."
                )

            doc_type = infer_document_type(extraction_result["full_text"])

            # Detect language: check if document text is predominantly English
            devanagari_chars = sum(1 for ch in extracted_text if '\u0900' <= ch <= '\u097F')
            latin_chars = sum(1 for ch in extracted_text if ('A' <= ch <= 'Z') or ('a' <= ch <= 'z'))
            is_english_doc = latin_chars > 80 and devanagari_chars < 50

            # Phase 3: Run local field extraction (regex + rule-based)
            structured_data = extract_fields(extraction_result["full_text"], doc_type)

            # If English land record or if local rule-based extraction found 0 owners,
            # elevate to Neural Vision AI to extract all owners, parcels, and land record entities
            api_key = get_gemini_api_key()
            if api_key and (is_english_doc or len(structured_data.get("owners", [])) == 0):
                try:
                    logger.info(f"Invoking Neural Vision AI for English / complex document: {saved_path.name}")
                    ai_structured = extract_handwritten_with_gemini(str(saved_path), api_key=api_key)
                    if ai_structured and len(ai_structured.get("owners", [])) > 0:
                        structured_data = ai_structured
                        raw_doc_type = ai_structured.get("extraction_meta", {}).get("document_type") or doc_type
                        doc_type = str(raw_doc_type)[:250] if raw_doc_type else doc_type
                        extraction_result["engine_used"] = "bhu_setu_neural_vision"
                        extraction_result["average_confidence"] = ai_structured.get("extraction_meta", {}).get("average_confidence", 0.93)
                        logger.info(f"Successfully extracted {len(structured_data.get('owners', []))} owners and {len(structured_data.get('parcels', []))} parcels via Neural Vision AI")
                except Exception as ai_err:
                    logger.warning(f"Neural Vision AI extraction fallback failed: {ai_err}")

        # Phase 4: Run validation rules (including DB duplicate check)
        validation_result = validate_extraction(structured_data, db)
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
            "structured_data": structured_data,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error processing uploaded document: {exc}", exc_info=True)
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


@router.post("/upload", status_code=status.HTTP_200_OK)
async def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Uploads a single land record document (PDF/image), detects whether it is a
    digital-native PDF or scanned file, runs text extraction, field extraction
    (Phase 3), validation rules (Phase 4), saves the document record to MySQL,
    and returns the full structured result including validation warnings.
    """
    filename = file.filename or "uploaded_document"
    contents = await file.read()
    return _process_single_file_content(contents, filename, db)


@router.post("/upload/batch", status_code=status.HTTP_200_OK)
async def upload_batch_documents(
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    """
    Accepts multiple land record files in a single batch, processes each through the pipeline,
    and returns an array of structured results along with success/failure statistics.
    """
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="कोई फ़ाइल प्राप्त नहीं हुई। कृपया कम से कम एक दस्तावेज़ चुनें। / No files uploaded."
        )

    results = []
    errors = []

    for f in files:
        fname = f.filename or "uploaded_document"
        try:
            contents = await f.read()
            res = _process_single_file_content(contents, fname, db)
            results.append(res)
        except Exception as exc:
            err_msg = exc.detail if isinstance(exc, HTTPException) else str(exc)
            logger.warning(f"Batch item failed for '{fname}': {err_msg}")
            errors.append({
                "filename": fname,
                "error": err_msg
            })

    return {
        "total": len(files),
        "successful": len(results),
        "failed": len(errors),
        "results": results,
        "errors": errors,
    }


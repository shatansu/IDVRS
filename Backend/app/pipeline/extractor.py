import os
import shutil
import logging
import unicodedata
import numpy as np
import pymupdf
import pdfplumber
import pytesseract
from PIL import Image

from app.pipeline.detector import detect_document_source
from app.pipeline.preprocessor import preprocess_image

logger = logging.getLogger("app.pipeline.extractor")

# Configure Tesseract binary path if available
TESSERACT_CANDIDATE_PATHS = [
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    os.path.expanduser(r"~\AppData\Local\Programs\Tesseract-OCR\tesseract.exe")
]

def find_tesseract_binary() -> str | None:
    """Finds tesseract binary on the system."""
    which_path = shutil.which("tesseract")
    if which_path:
        return which_path
    for path in TESSERACT_CANDIDATE_PATHS:
        if os.path.isfile(path):
            return path
    return None

tesseract_cmd = find_tesseract_binary()
if tesseract_cmd:
    pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
    logger.info(f"Configured Tesseract binary at: {tesseract_cmd}")
else:
    logger.warning("Tesseract binary not found in standard system paths. OCR fallback will require Tesseract to be installed.")

def clean_and_normalize_text(text: str) -> str:
    """
    Applies Unicode NFC normalization to compose Devanagari matras,
    strips null bytes, and cleans up repeated whitespace while preserving newlines.
    """
    if not text:
        return ""
    # Strip null characters that occasionally appear in embedded PDF fonts
    text = text.replace("\x00", "")
    # Normalize Unicode to NFC
    normalized = unicodedata.normalize("NFC", text)
    # Clean trailing spaces per line
    lines = [line.strip() for line in normalized.splitlines()]
    return "\n".join(lines)

def extract_from_digital_pdf(file_path: str) -> dict:
    """
    Extracts text directly from digital-native PDFs using PyMuPDF + pdfplumber,
    applying Unicode normalization to prevent Devanagari split-ligature issues.
    """
    logger.info(f"Extracting digital text from {file_path}")
    page_texts = []
    full_text_parts = []

    with pymupdf.open(file_path) as doc:
        for page_idx, page in enumerate(doc):
            raw_page_text = page.get_text()
            clean_text = clean_and_normalize_text(raw_page_text)
            
            page_info = {
                "page_number": page_idx + 1,
                "character_count": len(clean_text),
                "confidence": 0.98,  # Digital text has ~98% reliability
                "text": clean_text
            }
            page_texts.append(page_info)
            full_text_parts.append(f"--- PAGE {page_idx + 1} ---\n{clean_text}")

    full_text = "\n\n".join(full_text_parts)

    return {
        "source_mode": "digital_text",
        "page_count": len(page_texts),
        "character_count": sum(p["character_count"] for p in page_texts),
        "average_confidence": 0.98,
        "page_texts": page_texts,
        "full_text": full_text
    }

def extract_from_ocr(file_path: str) -> dict:
    """
    Extracts text using OpenCV preprocessing + Tesseract OCR (hin+eng)
    for scanned images or scanned PDFs.
    """
    logger.info(f"Extracting OCR text from {file_path}")
    global tesseract_cmd
    if not tesseract_cmd:
        tesseract_cmd = find_tesseract_binary()
        if tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd

    if not tesseract_cmd:
        raise RuntimeError(
            "Tesseract OCR engine is not installed or not found in system PATH. "
            "Please install Tesseract-OCR to enable image OCR processing."
        )

    _, ext = os.path.splitext(file_path)
    ext = ext.lower()

    images_to_process = []

    if ext == ".pdf":
        # Render PDF pages to images using PyMuPDF
        with pymupdf.open(file_path) as doc:
            for page in doc:
                # 300 DPI render (zoom factor ~4.16 for 72 dpi base)
                pix = page.get_pixmap(dpi=300)
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                images_to_process.append(img)
    else:
        # Load image file
        img = Image.open(file_path)
        images_to_process.append(img)

    page_texts = []
    full_text_parts = []
    all_confidences = []

    # Check available languages
    try:
        langs = pytesseract.get_languages()
        ocr_lang = "hin+eng" if "hin" in langs else "eng"
    except Exception:
        ocr_lang = "hin+eng"

    for idx, img in enumerate(images_to_process):
        # 1. OpenCV Preprocessing
        preprocessed_img = preprocess_image(img)

        # 2. Tesseract OCR text extraction
        raw_text = pytesseract.image_to_string(preprocessed_img, lang=ocr_lang)
        clean_text = clean_and_normalize_text(raw_text)

        # 3. Calculate confidence via image_to_data
        try:
            data = pytesseract.image_to_data(preprocessed_img, lang=ocr_lang, output_type=pytesseract.Output.DICT)
            confs = [float(c) for c in data.get("conf", []) if str(c).replace("-1", "").strip()]
            page_conf = (sum(confs) / len(confs) / 100.0) if confs else 0.80
        except Exception as exc:
            logger.warning(f"Could not compute OCR confidence: {exc}")
            page_conf = 0.80

        all_confidences.append(page_conf)
        page_info = {
            "page_number": idx + 1,
            "character_count": len(clean_text),
            "confidence": round(page_conf, 2),
            "text": clean_text
        }
        page_texts.append(page_info)
        full_text_parts.append(f"--- PAGE {idx + 1} ---\n{clean_text}")

    avg_conf = round(sum(all_confidences) / len(all_confidences), 2) if all_confidences else 0.80
    full_text = "\n\n".join(full_text_parts)

    return {
        "source_mode": "ocr",
        "page_count": len(page_texts),
        "character_count": sum(p["character_count"] for p in page_texts),
        "average_confidence": avg_conf,
        "page_texts": page_texts,
        "full_text": full_text
    }

def extract_document(file_path: str) -> dict:
    """
    Main entry point for document extraction:
    1. Detects document source (digital_text vs ocr).
    2. Runs the appropriate extraction strategy.
    3. Normalizes and returns clean structured output.
    """
    source_mode, page_count = detect_document_source(file_path)
    logger.info(f"Document {file_path} resolved to source mode: {source_mode} ({page_count} pages)")

    if source_mode == "digital_text":
        return extract_from_digital_pdf(file_path)
    else:
        return extract_from_ocr(file_path)

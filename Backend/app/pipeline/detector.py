import os
import logging
import pymupdf
from PIL import Image

from app.pipeline.handwriting_detector import classify_image_content

logger = logging.getLogger("app.pipeline.detector")

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}


def detect_document_source(file_path: str) -> tuple[str, int, str]:
    """
    Detects:
    1. source_mode: either 'digital_text' or 'ocr' (preserves MySQL Document.source_mode enum compatibility).
    2. page_count: number of pages.
    3. classification: 'printed', 'handwritten', 'mixed', or 'unknown'.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    _, ext = os.path.splitext(file_path)
    ext = ext.lower()

    if ext in IMAGE_EXTENSIONS:
        try:
            classification, _ = classify_image_content(file_path)
        except Exception as exc:
            logger.warning(f"Classification failed for image {file_path}: {exc}")
            classification = "unknown"
        return "ocr", 1, classification

    if ext == ".pdf":
        try:
            with pymupdf.open(file_path) as doc:
                page_count = len(doc)
                if page_count == 0:
                    return "ocr", 0, "unknown"

                total_chars = 0
                for page in doc:
                    text = page.get_text().strip()
                    total_chars += len(text)

                # If text layer has substantial content (> 50 chars total), classify as digital_text & printed
                if total_chars >= 50:
                    logger.info(
                        f"Detected digital-native PDF: {file_path} "
                        f"({page_count} pages, {total_chars} text characters)"
                    )
                    return "digital_text", page_count, "printed"
                else:
                    logger.info(
                        f"Detected scanned/image PDF: {file_path} "
                        f"({page_count} pages, only {total_chars} text chars found)"
                    )
                    # Classify based on first rendered page
                    try:
                        first_page = doc[0]
                        pix = first_page.get_pixmap(dpi=150)
                        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                        classification, _ = classify_image_content(img)
                    except Exception as exc:
                        logger.warning(f"Error classifying scanned PDF page: {exc}")
                        classification = "unknown"

                    return "ocr", page_count, classification
        except Exception as exc:
            logger.warning(f"Error reading PDF text layer: {exc}. Defaulting to OCR mode.")
            return "ocr", 1, "unknown"

    # Default fallback
    return "ocr", 1, "unknown"

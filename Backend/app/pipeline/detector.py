import os
import logging
import pymupdf

logger = logging.getLogger("app.pipeline.detector")

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}

def detect_document_source(file_path: str) -> tuple[str, int]:
    """
    Detects whether the uploaded file is a digital-native PDF (with an extractable text layer)
    or an image/scanned PDF requiring the OCR pipeline.

    Returns:
        tuple (source_mode, page_count)
        where source_mode is either 'digital_text' or 'ocr'.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    _, ext = os.path.splitext(file_path)
    ext = ext.lower()

    if ext in IMAGE_EXTENSIONS:
        return "ocr", 1

    if ext == ".pdf":
        try:
            with pymupdf.open(file_path) as doc:
                page_count = len(doc)
                if page_count == 0:
                    return "ocr", 0

                total_chars = 0
                for page in doc:
                    text = page.get_text().strip()
                    total_chars += len(text)

                # If text layer has substantial content (> 50 chars total), classify as digital_text
                # Average scanned/blank PDF has 0-10 garbage characters
                if total_chars >= 50:
                    logger.info(
                        f"Detected digital-native PDF: {file_path} "
                        f"({page_count} pages, {total_chars} text characters)"
                    )
                    return "digital_text", page_count
                else:
                    logger.info(
                        f"Detected scanned/image PDF: {file_path} "
                        f"({page_count} pages, only {total_chars} text chars found)"
                    )
                    return "ocr", page_count
        except Exception as exc:
            logger.warning(f"Error reading PDF text layer: {exc}. Defaulting to OCR mode.")
            return "ocr", 1

    # Default fallback
    return "ocr", 1

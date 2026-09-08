"""
Modular Indic Handwriting OCR Adapter
====================================
Primary Engine: Self-hosted EasyOCR (PyTorch CRNN + CRAFT) with Devanagari ('hi') & English ('en') models.
Fallback: Tesseract OCR (hin+eng) via existing extractor.
Preserves word/line bounding boxes and confidence scores as evidence.
"""

import os
import logging
import unicodedata
import numpy as np
from PIL import Image
from typing import Union, Optional, List

from app.pipeline.ocr_types import OCRResult, OCRPage, OCRTextBlock

logger = logging.getLogger("app.pipeline.handwriting_adapter")

# Global singleton for lazy loading
_easyocr_reader = None


def get_easyocr_reader():
    """
    Lazily loads and caches the EasyOCR Reader for Hindi and English.
    Avoids loading PyTorch models into memory until an actual handwriting OCR is requested.
    """
    global _easyocr_reader
    if _easyocr_reader is None:
        try:
            import easyocr
            logger.info("Initializing self-hosted EasyOCR Reader for ['hi', 'en'] (CPU mode)...")
            _easyocr_reader = easyocr.Reader(["hi", "en"], gpu=False, verbose=False)
            logger.info("EasyOCR Reader initialized successfully.")
        except Exception as exc:
            logger.error(f"Failed to initialize EasyOCR: {exc}. Will use Tesseract fallback.")
            _easyocr_reader = None
    return _easyocr_reader


def clean_devanagari_text(text: str) -> str:
    """Applies Unicode NFC normalization and strips null bytes / OCR noise."""
    if not text:
        return ""
    text = text.replace("\x00", "").strip()
    
    # Common OCR character confusions in Hindi revenue records
    ocr_fixes = {
        "तिलतिप्ी": "प्रतिलिपि",
        "तिलिपी": "प्रतिलिपि",
        "सल्जतलपी": "सत्य प्रतिलिपि",
        "सलनतलपी": "सत्य प्रतिलिपि",
        "शिमर": "सिमरिया",
    }
    for bad, good in ocr_fixes.items():
        text = text.replace(bad, good)

    normalized = unicodedata.normalize("NFC", text)
    import re
    # Deduplicate consecutive vowel signs / matras
    normalized = re.sub(r"([\u0901-\u0903\u093E-\u094D])\1+", r"\1", normalized)
    return normalized


def run_easyocr_on_image(img_input: Union[str, Image.Image, np.ndarray]) -> tuple[str, float, List[OCRTextBlock]]:
    """
    Executes EasyOCR on an image and returns:
    (assembled_text, avg_confidence, text_blocks_with_bounding_boxes)
    """
    reader = get_easyocr_reader()
    if reader is None:
        raise RuntimeError("EasyOCR reader is not available.")

    # Convert to PIL Image to evaluate resolution
    if isinstance(img_input, str):
        pil_img = Image.open(img_input).convert("RGB")
    elif isinstance(img_input, np.ndarray):
        pil_img = Image.fromarray(img_input).convert("RGB")
    else:
        pil_img = img_input.convert("RGB")

    w, h = pil_img.size
    # If image resolution is low, upscale for better Indic character detection
    scale = max(1.0, 1400.0 / max(w, h))
    if scale > 1.05:
        new_w, new_h = int(w * scale), int(h * scale)
        scaled_img = pil_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        img_np = np.array(scaled_img)
    else:
        scale = 1.0
        img_np = np.array(pil_img)

    # Run EasyOCR with bounding box details
    raw_results = reader.readtext(img_np, detail=1, paragraph=False)

    blocks: List[OCRTextBlock] = []
    confs: List[float] = []
    items = []

    for bbox, text, conf in raw_results:
        clean_txt = clean_devanagari_text(text)
        if not clean_txt:
            continue

        c_val = float(conf)
        confs.append(c_val)

        # Rescale bbox coordinates back to original image coordinate space
        orig_bbox = [[int(pt[0] / scale), int(pt[1] / scale)] for pt in bbox]
        y_top = min(p[1] for p in orig_bbox)
        y_bot = max(p[1] for p in orig_bbox)
        x_left = min(p[0] for p in orig_bbox)
        y_center = (y_top + y_bot) / 2.0
        height = max(10, y_bot - y_top)

        blocks.append(OCRTextBlock(
            text=clean_txt,
            confidence=round(c_val, 2),
            bbox=orig_bbox,
            is_handwritten=True,
        ))

        items.append({
            "text": clean_txt,
            "conf": c_val,
            "bbox": orig_bbox,
            "y_top": y_top,
            "y_center": y_center,
            "x_left": x_left,
            "height": height,
        })

    # Sort items geometrically by y_center
    items.sort(key=lambda it: it["y_center"])
    lines = []
    curr_line = []
    curr_y = None
    avg_h = sum(it["height"] for it in items) / len(items) if items else 15

    for it in items:
        if curr_y is None:
            curr_y = it["y_center"]
            curr_line = [it]
        elif abs(it["y_center"] - curr_y) <= avg_h * 0.7:
            curr_line.append(it)
            curr_y = sum(x["y_center"] for x in curr_line) / len(curr_line)
        else:
            curr_line.sort(key=lambda x: x["x_left"])
            lines.append(" ".join(x["text"] for x in curr_line))
            curr_line = [it]
            curr_y = it["y_center"]

    if curr_line:
        curr_line.sort(key=lambda x: x["x_left"])
        lines.append(" ".join(x["text"] for x in curr_line))

    assembled_text = "\n".join(lines)
    avg_confidence = round(sum(confs) / len(confs), 2) if confs else 0.0

    return assembled_text, avg_confidence, blocks


def extract_handwritten_document(file_path: str, classification: str = "handwritten") -> OCRResult:
    """
    Main extraction function for handwritten/mixed documents:
    1. Attempts primary self-hosted Indic EasyOCR engine.
    2. Gathers line/word bounding boxes as OCR evidence.
    3. Gracefully falls back to Tesseract OCR if EasyOCR encounters an error.
    """
    logger.info(f"Extracting handwritten document {file_path} (classification={classification})")
    _, ext = os.path.splitext(file_path)
    ext = ext.lower()

    images_to_process: list[Image.Image] = []

    if ext == ".pdf":
        import pymupdf
        with pymupdf.open(file_path) as doc:
            for page in doc:
                pix = page.get_pixmap(dpi=200)
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                images_to_process.append(img)
    else:
        images_to_process.append(Image.open(file_path))

    # Attempt primary local EasyOCR
    try:
        page_texts = []
        full_text_parts = []
        all_confs = []
        all_evidence = []
        total_chars = 0

        for idx, img in enumerate(images_to_process):
            text, conf, blocks = run_easyocr_on_image(img)
            all_confs.append(conf)
            total_chars += len(text)

            page_info = {
                "page_number": idx + 1,
                "character_count": len(text),
                "confidence": conf,
                "text": text
            }
            page_texts.append(page_info)
            full_text_parts.append(f"--- PAGE {idx + 1} ---\n{text}")

            for b in blocks:
                all_evidence.append({
                    "page": idx + 1,
                    "text": b.text,
                    "confidence": b.confidence,
                    "bbox": b.bbox,
                    "is_handwritten": True
                })

        avg_conf = round(sum(all_confs) / len(all_confs), 2) if all_confs else 0.75
        full_text = "\n\n".join(full_text_parts)

        logger.info(f"EasyOCR Indic handwriting extraction completed for {file_path} ({len(page_texts)} pages, {len(all_evidence)} tokens)")

        return OCRResult(
            source_mode="ocr",
            classification=classification,
            engine_used="easyocr_indic",
            page_count=len(page_texts),
            character_count=total_chars,
            average_confidence=avg_conf,
            page_texts=page_texts,
            full_text=full_text,
            evidence=all_evidence,
        )

    except Exception as exc:
        logger.warning(
            f"EasyOCR extraction failed for {file_path}: {exc}. "
            f"Gracefully falling back to Tesseract OCR engine."
        )
        # Fallback to existing Tesseract extraction
        from app.pipeline.extractor import extract_from_ocr
        legacy_res = extract_from_ocr(file_path)

        return OCRResult(
            source_mode="ocr",
            classification=classification,
            engine_used="tesseract_fallback",
            page_count=legacy_res["page_count"],
            character_count=legacy_res["character_count"],
            average_confidence=legacy_res["average_confidence"],
            page_texts=legacy_res["page_texts"],
            full_text=legacy_res["full_text"],
            evidence=legacy_res.get("evidence", []),
        )

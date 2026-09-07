"""
Unified OCR Result Abstraction
==============================
Defines common data types for all text extraction pipelines:
- Digital-native PDF (PyMuPDF / pdfplumber)
- Local Indic Handwriting OCR (EasyOCR CRAFT + Recognizer)
- Scanned OCR Fallback (Tesseract hin+eng)
- Optional Cloud Vision OCR Hook
"""

from dataclasses import dataclass, field, asdict
from typing import Optional, Any


@dataclass
class OCRTextBlock:
    text: str
    confidence: float
    bbox: Optional[list[Any]] = None  # [x, y, w, h] or [[x1, y1], [x2, y2], ...]
    is_handwritten: Optional[bool] = None

    def to_dict(self) -> dict:
        return {
            "text": self.text,
            "confidence": round(float(self.confidence), 2),
            "bbox": self.bbox,
            "is_handwritten": self.is_handwritten,
        }


@dataclass
class OCRPage:
    page_number: int
    text: str
    character_count: int
    confidence: float
    blocks: list[OCRTextBlock] = field(default_factory=list)
    image_path: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "page_number": self.page_number,
            "character_count": self.character_count,
            "confidence": round(float(self.confidence), 2),
            "text": self.text,
            "blocks": [b.to_dict() for b in self.blocks],
            "image_path": self.image_path,
        }


@dataclass
class OCRResult:
    source_mode: str  # "digital_text" | "ocr"
    classification: str  # "printed" | "handwritten" | "mixed" | "unknown"
    engine_used: str  # "pymupdf" | "easyocr_indic" | "tesseract_fallback" | "cloud_vision_optional"
    page_count: int
    character_count: int
    average_confidence: float
    page_texts: list[dict]
    full_text: str
    evidence: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "source_mode": self.source_mode,
            "classification": self.classification,
            "engine_used": self.engine_used,
            "page_count": self.page_count,
            "character_count": self.character_count,
            "average_confidence": round(float(self.average_confidence), 2),
            "page_texts": self.page_texts,
            "full_text": self.full_text,
            "evidence": self.evidence,
        }

IDVRS Project — Complete Session Summary
Here's a comprehensive handoff summary for your project.

🏗️ Project Overview
IDVRS (Intelligent Document Verification and Registry System) — A React + FastAPI application for digitizing and verifying Indian land revenue documents (MP Bhulekh Form 4 / Form 7 and legacy handwritten registers).

- Frontend: React + Vite → http://localhost:5173
- Backend: FastAPI (Python) → http://127.0.0.1:8000
- Database: MySQL (no dummy data — only real uploaded documents)

🔑 Critical Architecture Rules (Never Break These)
1. 5-part matching key: (state, district, tehsil, village, survey_no) — used everywhere
2. khata_id = DB primary key (integer) vs khata_number = revenue string — always keep separate
3. Recorded area = from MySQL; spatial geometry area = always "Not calculated" (synthetic GeoJSON demo data only)
4. GIS polygons are synthetic/demo — never represent as authoritative government boundaries
5. No dummy/seed data — real documents only for demo
6. MySQL source_mode compatibility: remains 'digital_text' | 'ocr' in documents table enum

✅ Work Completed

1. Local Self-Hosted Indic Handwriting OCR & Classification (Completed)
- Integrated self-hosted EasyOCR (`hi` + `en` with CRAFT detector + PyTorch recognizer) as the primary handwriting engine in `Backend/app/pipeline/handwriting_adapter.py`.
- Tesseract (`hin+eng`) preserved strictly as baseline/fallback engine.
- Created `Backend/app/pipeline/handwriting_detector.py` for conservative document categorization into `printed`, `handwritten`, `mixed`, or `unknown` (mixed printed table + handwritten entries treated as first-class).
- Standardized extraction contract in `Backend/app/pipeline/ocr_types.py` (`OCRResult`) capturing raw text, confidence, page breakdown, and word/line bounding boxes as OCR evidence.
- Verified handwritten document extraction using `handwrriten_images/WhatsApp Image 2026-09-07 at 8.00.18 PM (1).jpeg`.

2. Authoritative Server-Side Re-Validation & Owner Share Validation (Completed)
- In `Backend/app/pipeline/validator.py`: added `_check_owner_share_fractions()`:
  - Over-allocation (`sum > 1.0`) -> BLOCKING ERROR (422)
  - Invalid format, negative share, or zero denominator (`1/0`) -> BLOCKING ERROR (422)
  - Under-allocation (`sum < 1.0`) -> ADVISORY WARNING only
- In `Backend/app/api/records.py`: `POST /api/records` executes server-side re-validation on incoming final edited data before committing to MySQL. Never blindly trusts client validation flags.

3. Frontend HITL Review & Demo Presets (Completed)
- Added 1-click demo preset for real handwritten register (`Handwritten_Register_Simariya_Panna.jpeg`) accessed via relative public path `/samples/...` (no hardcoded Windows drive paths).
- `UploadPage.jsx` and `ReviewPage.jsx` display classification badge (`✍️ Handwritten`, `📋 Mixed Register`, or `🖨️ Printed`) and engine tag (`easyocr_indic`).
- Added full Hindi and English translations in `hi.json` and `en.json`.
- Frontend build verified: `✓ 2546 modules transformed, 0 errors`.

4. GIS & Multilingual Support (Maintained)
- GIS cascading hierarchy dropdowns, GeoJSON maps, dashboard statistics, and registry views remain 100% operational with zero regression.

🗂️ Key File Locations
```
d:\SIH-Prototype_IDVRS\
├── summary.md                             ← Project rules & architecture (READ FIRST)
├── multi_lingual.md                       ← i18n constraints
├── HANDWRITING_GUIDE.md                   ← Spec file
├── handwrriten_images/                    ← Original handwritten sample documents
├── Backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── upload.py                  ← /api/upload with classification & evidence
│   │   │   └── records.py                 ← /api/records with authoritative server validation
│   │   └── pipeline/
│   │       ├── ocr_types.py               ← Unified OCRResult contract
│   │       ├── handwriting_detector.py    ← Printed/Handwritten/Mixed/Unknown classifier
│   │       ├── handwriting_adapter.py     ← Self-hosted EasyOCR Indic engine
│   │       ├── detector.py                ← Source mode & classification detection
│   │       ├── extractor.py               ← Multi-engine extractor & Tesseract fallback
│   │       ├── field_extractor.py         ← Single domain regex/rule extractor
│   │       └── validator.py               ← Validation rules & owner share fraction check
└── Frontend/
    ├── public/samples/                    ← Demo sample files (PDFs + Handwritten JPEG)
    └── src/
        ├── i18n/                          ← Complete hi.json and en.json
        ├── pages/
        │   ├── UploadPage.jsx             ← Presets, dropzone, and format cards
        │   └── ReviewPage.jsx             ← HITL review, classification badges, server validation
        └── App.jsx                        ← Header with language toggle
```
# IDVRS — Comprehensive End-to-End System Test Report

**Date of Execution**: 2026-09-08  
**Tested By**: Antigravity AI Pair Programmer (Live Browser & Automated Pipeline Verification)  
**Target Environment**: 
- **Frontend**: `http://localhost:5173` (Vite + React)
- **Backend API**: `http://127.0.0.1:8000` (FastAPI + Uvicorn)
- **Database**: MySQL `land_record_db` on `localhost:3306`

---

## 1. Executive Summary

A complete, live end-to-end audit was conducted across the entire IDVRS platform, including:
1. Automated backend processing of **all 5 sample documents** located in `sample_docs/`.
2. Live UI browser interactions using autonomous browser agents for:
   - Dashboard (`/`)
   - Document Upload (`/upload`)
   - Human-in-the-Loop Review (`/review`)
   - Database Persistence (`/records/:id`)
   - Land Registry Master Records (`/records`)
   - GIS Cadastral Map & Parcel Search (`/gis`)
   - Multilingual Switcher (Hindi ↔ English)

---

## 2. Document-by-Document Test Matrix

| # | Document Name | Category | Engine Used | Processing Time | Status | Extracted Fields & Counts | Validation Result |
|---|---|---|---|---|---|---|---|
| **1** | `CertifiedCopy_Bhu-AdhikarPustika_25030879728.pdf` | Printed Hindi PDF (Form 4) | `pymupdf` (100% Local) | **0.22s** | **PASS** | • Village: सिमरिया<br>• Tehsil: सिमरिया<br>• District: पन्ना<br>• Khata: 2305<br>• CLRM: 25030879728<br>• **9 Owners, 8 Parcels** | **Passed (0 Errors, 0 Warnings)** |
| **2** | `CertifiedCopy_Khatoni(B1)Copy_25030868731.pdf` | Printed Hindi PDF (Form 7) | `pymupdf` (100% Local) | **0.25s** | **PASS** | • Village: सिमरिया<br>• Tehsil: सिमरिया<br>• District: पन्ना<br>• Khata: 2305<br>• CLRM: 25030868731<br>• **9 Owners, 8 Parcels** | **Passed (0 Errors, 0 Warnings)** |
| **3** | `land_record_english.pdf` | Printed English PDF (Bhu-Adhikar Translation) | `pymupdf` (Digital Text) | **0.11s** | **PARTIAL** | • Doc Type: `other`<br>• Khata: 1 (fallback)<br>• **0 Owners, 0 Parcels**<br>*(See Issue #1 below)* | **Failed (4 Errors, 1 Warning)**<br>Missing Village, Tehsil, District, Owners |
| **4** | `WhatsApp Image 2026-09-07 at 8.00.18 PM (1).jpeg` | Handwritten Register Image (Sample 1) | `gemini_vision` (`gemini-3.1-flash-lite`) | **4.03s** | **PASS** | • Village: सिमरिया<br>• Tehsil: सिमरिया<br>• District: पन्ना<br>• Khata: 22<br>• CLRM: 426/0718/2662/2024<br>• **5 Owners, 7 Parcels** | **Passed (0 Errors, 0 Warnings)** |
| **5** | `WhatsApp Image 2026-09-07 at 8.03.59 PM.jpeg` | Handwritten Register Image (Sample 2) | `gemini_vision` (`gemini-3.1-flash-lite`) | **4.35s** | **PARTIAL** | • Village: सिमरिया<br>• Tehsil: सिमरिया<br>• District: पन्ना<br>• CLRM: 426/0718/2662/2024<br>• **4 Owners, 6 Parcels**<br>• Khata No: `null`<br>*(See Issue #2 below)* | **Failed (1 Error, 0 Warnings)**<br>Missing Khata Number |

---

## 3. Live Browser UI Flow Verification

### Flow A: Printed Document Digitization (Form 4 PDF)
1. **Upload (`/upload`)**: Selected Form 4 sample preset. Status pipeline animated smoothly across stages (*Upload -> Preprocessing -> OCR / Digital Extraction -> Validation*).
2. **Review (`/review`)**:
   - Redirected seamlessly to `/review`.
   - Master fields populated: Khata `2305`, CLRM `25030879728`, Village `सिमरिया`, Tehsil `सिमरिया`, District `पन्ना`.
   - All 9 owners rendered in table with shares (`कल्पना सेन`: 1/3, `दीपाली सेन`: 1/15, etc.).
   - All 8 parcels rendered with survey numbers (`96/1`, `98/1`, `99/1`, `100`, `101`, `102/1`, `103/1`, `113/1`) and hectarage.
   - Validation banner displayed 0 errors.
3. **Save Record**:
   - Clicked **"अभिलेख सेव करें" (Save Record)**.
   - Successfully committed to MySQL as **Khata ID `#14`**.
   - Redirected to certified record detail view `/records/14`.
4. **Registry Verification (`/records`)**:
   - Record `#14` rendered in Land Registry table with primary owner, co-owner badge count (+8), Khasra badge count (8), and status.
5. **GIS Integration (`/gis`)**:
   - Opened Cadastral Map.
   - Searched Khasra `96/1`. System located the polygon and updated linkage indicator to **1 Matched Parcel**.

### Flow B: Handwritten Document Digitization (`WhatsApp Image ... PM (1).jpeg`)
1. **Upload (`/upload`)**: Selected Handwritten Register preset.
2. **AI Processing**: Gemini Vision (`gemini-3.1-flash-lite`) finished in ~4.5 seconds.
3. **Review (`/review`)**:
   - Master fields populated dynamically without hardcoding: Khata `22`, CLRM `426/0718/2662/2024`, Village `सिमरिया` (from narrative sentence), Tehsil `सिमरिया` (from seal), District `पन्ना` (from circular stamp).
   - 5 Co-Owners extracted:
     1. सुगरा बाई (बेवा)
     2. तिलुक
     3. रामचरण
     4. नंदू
     5. रामस्वरूप
   - 7 Parcels extracted:
     1. `85/1` (0.906 ha)
     2. `86/1` (0.050 ha)
     3. `86/2` (0.025 ha)
     4. `900` (0.082 ha)
     5. `903/1` (0.020 ha)
     6. `902/1` (0.625 ha)
     7. `992/1` (0.081 ha)
   - Total land area: `1.7890 ha`, Total land revenue: `₹ 5.62`.
4. **Save Record**:
   - Clicked **"अभिलेख सेव करें" (Save Record)**.
   - Successfully saved to MySQL as **Khata ID `#15`** (Document ID `#61`).
   - Redirected to certified view `/records/15`.

---

## 4. Issues & Gaps Identified for Subsequent Fixes

As per user instruction (*"koi problem ho system me to fix karna hai lekin fix bad me karna hai jo fix karna haii usko note karte chalna ok"*), the following issues have been noted down with root causes and proposed solutions:

### Issue #1: English Land Records Lack Regex Patterns in `field_extractor.py`
- **Observed Behavior**: `sample_docs/land_record_english.pdf` is parsed by PyMuPDF, but returns 0 owners, 0 parcels, and fails validation with 4 errors (missing village, tehsil, district, owners).
- **Root Cause**: In [field_extractor.py](file:///d:/SIH-Prototype_IDVRS/Backend/app/pipeline/field_extractor.py) and [upload.py](file:///d:/SIH-Prototype_IDVRS/Backend/app/api/upload.py), document classification and regex patterns are written exclusively for Hindi keywords (`भू-अधिकार`, `खतौनी`, `ग्राम`, `तहसील`, `खाता संख्यांक`, `भूमि स्वामी`, etc.). The English document contains English labels (`CLRM No`, `Village/Town Name`, `Tehsil`, `District`, `Account No.: 2305`, `Landowner-Name`, `Part - One (a)`, etc.).
- **Fix Required**:
  1. Add English document detection keyword rules in `infer_document_type()` (`"CLRM No"`, `"Landowner-Name"`, `"Bhu-Adhikar"`, `"Account No."`).
  2. Add bilingual English/Hindi regex patterns in `field_extractor.py` for Khata master fields, English co-owners table, and English survey parcels table.

---

### Issue #2: Missing Khata Number in Mutation Register Scans (Sample 2)
- **Observed Behavior**: `sample_docs/handwrriten_images/WhatsApp Image 2026-09-07 at 8.03.59 PM.jpeg` extracts 4 owners and 6 parcels, but `khata_number` is `null`, resulting in a validation error: `"Required field 'खाता संख्यांक' (khata_number) is missing or empty"`.
- **Root Cause**: In mutation registers (नामांतरण पंजी), cases are recorded chronologically by order number (`प्रकरण क्रमांक`) or case number. Sometimes the Khata column is labeled "पूर्व खाता" / "नवीन खाता" or is blank before the order is finalized.
- **Fix Required**:
  1. In `gemini_vision_adapter.py`, instruct Gemini to look for "पूर्व खाता", "नवीन खाता", "खाता क्रमांक" or case/order numbers as fallback identifier.
  2. In `validator.py`, for Mutation Registers (`mutation_register` or `नामांतरण पंजी`), make `khata_number` advisory (warning) rather than hard blocker if a valid `clrm_no` / case number exists, OR allow the user to easily fill it in during HITL review.

---

### Issue #3: Sample Docs Preset / Upload Button for English Document
- **Observed Behavior**: The UI currently has quick preset buttons for Form 4 (Hindi), Form 7 (Hindi), and Handwritten Register.
- **Fix Required**: Add a preset button or clear sample option for `land_record_english.pdf` once bilingual extraction is implemented.

---

## 5. Artifacts & Recordings Generated

- **Full Browser Session 1 Recording**: [e2e_ui_test_1788862494657.webp](file:///C:/Users/ASUS/.gemini/antigravity-ide/brain/86185c68-ba36-434b-8225-ea0e4a42ffd9/e2e_ui_test_1788862494657.webp)
- **Full Browser Session 2 Recording (Handwritten)**: [hwr_ui_test_1788863077951.webp](file:///C:/Users/ASUS/.gemini/antigravity-ide/brain/86185c68-ba36-434b-8225-ea0e4a42ffd9/hwr_ui_test_1788863077951.webp)
- **Automated Batch Test Raw Telemetry**: [batch_test_results.json](file:///C:/Users/ASUS/.gemini/antigravity-ide/brain/86185c68-ba36-434b-8225-ea0e4a42ffd9/scratch/batch_test_results.json)
- **Key Screenshots**:
  - Top review of Form 4: `review_form4_top_1788862593624.png`
  - Owners section: `review_form4_owners_1788862618889.png`
  - Parcels section: `review_form4_parcels_1788862705741.png`
  - Saved record detail: `saved_record_view_1788862798842.png`
  - Land Registry listing: `records_page_list_1788862827889.png`
  - GIS Map with parcel match: `gis_map_searched_1788862909787.png`
  - Handwritten review top: `review_top_section_1788863121441.png`
  - Handwritten owners & parcels: `review_owners_parcels_1788863134322.png`

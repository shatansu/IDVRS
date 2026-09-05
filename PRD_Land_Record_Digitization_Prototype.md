# Product Requirements Document (PRD)
## Intelligent Land Record Digitization & Validation System — Hackathon Prototype

**Version:** 1.0
**Prepared for:** Internal Hackathon Prototype Build (via Antigravity / AI Vibe-Coding)
**Problem Statement ID:** SIH 26018
**Organization:** Ministry of Rural Development, Dept. of Land Resources (DoLR)

---

## 1. Purpose of This Document

This PRD is written to be given directly to an AI coding agent (Antigravity) so it can build a **working, demo-able prototype** end-to-end without ambiguity. It defines exactly what to build, in what order, with what tech stack, what data flows where, and what "done" looks like for each phase.

**Golden rule for the build:** Every feature must be *functionally real* — no hardcoded/fake outputs. A user uploads an actual scanned/photographed land record, and the system must genuinely run OCR + extraction on it and return real structured data. Accuracy can be imperfect; the pipeline must not be faked.

---

## 2. Problem Summary

Land records in India exist largely as scanned documents, handwritten registers, and legacy PDFs, in multiple formats and Indian languages. Manually digitizing them is slow, expensive, and error-prone. We need an AI system that:

- Extracts text from scanned/handwritten/printed land records (OCR)
- Classifies extracted text into structured fields (owner name, khasra number, khata number, survey number, village, tehsil, district, area, land type, etc.)
- Validates the extracted data (format checks, duplicate checks)
- Flags low-confidence fields for human review
- Displays everything in a clean dashboard

## 3. Domain Research Findings (Grounded in Real MP Land Records)

This section documents research into how Indian (specifically Madhya Pradesh) land records actually work, based on official sources and analysis of real sample documents (`Bhu-Adhikar Pustika` Form 4, and `Khatoni B-1` Form 7, certified copies from mpbhulekh.gov.in), so the extraction logic below reflects reality, not assumptions.

### 3.1 The Real Document Hierarchy

Indian land records are **not flat single-owner, single-plot documents**. They are hierarchical/relational:

- **Khasra** — the field-level record for a *single* survey number (soil type, area, crop, cultivator).
- **Khatauni / Khata** — an *account-level* record: one Khata groups **multiple co-owners** (often a joint family) and **multiple survey numbers/parcels** they collectively hold, each owner with a fractional **share** (e.g., 1/3, 1/15, 1/9).
- **Adhikar Abhilekh / Bhu-Adhikar Pustika** — the account-level Record of Rights: ties every parcel in a Khata to its owners and the nature of their right (Bhumiswami, tenant, government land, etc.).

**Concretely, in the sample documents provided:** Khata No. 2305 (village Simariya, tehsil Simariya, district Panna) has **8 co-owners** (कल्पना सेन, दीपाली सेन, रचना सेन, etc., each with a share like 1/3, 1/15, 1/9) jointly holding **8 separate survey-number parcels** (96/1(S), 98/1(S), 99/1(S)... each with its own area in hectares and land revenue in ₹).

**Implication for the system:** A single uploaded document does NOT map to a single flat database row. It maps to **one Khata (parent) + N owners (children) + N parcels (children)** — a relational structure, not a flat key-value form. The original flat field schema in earlier drafts of this PRD was incorrect and has been revised in Section 7 below.

### 3.2 Digital-Native PDFs vs. Scanned/Handwritten Documents

Testing on the actual sample PDFs revealed an important architectural fact: **certified copies downloaded from mpbhulekh.gov.in are digitally-generated PDFs with an embedded text layer — they are NOT scanned images.** This matters a lot for accuracy and architecture:

| Document Type | How to Extract Text | Expected Accuracy |
|---|---|---|
| Digital-native PDF (e.g., certified copies from government portals, our two sample docs) | Direct PDF text extraction (`pdfplumber` / `PyMuPDF`) — no OCR needed | High (~95%+), main risk is Devanagari font/ligature reordering issues, fixable with Unicode normalization |
| Scanned image / photocopy of an old register | OCR pipeline (Tesseract `hin` + `eng` trained data, with OpenCV preprocessing) | Moderate for clean printed text (~85–90% char accuracy); low for handwriting/faded/damaged pages |

**Note on a real bug found during testing:** Extracting text from the sample PDFs with a basic library (`pypdf`) produced garbled Devanagari — e.g. "भूमि" came out as "भ ू िम" (matras/ligatures split apart). This is a known issue with certain embedded Hindi fonts. `pdfplumber` or `PyMuPDF (fitz)` handle this better; as a safety net, apply `unicodedata.normalize('NFC', text)` after extraction. Antigravity must test this on the actual sample files, not assume it "just works."

**Required architecture change:** The pipeline must first **detect document type** — if the PDF has an extractable text layer (check via `pdfplumber`/`PyMuPDF`, i.e. `page.extract_text()` returns meaningful content), use direct text extraction. If not (i.e., it's a scanned image or a PDF made of embedded images), fall back to the OCR pipeline (OpenCV preprocessing → Tesseract). Both paths must feed into the *same* downstream field-extraction and validation logic.

### 3.3 Realistic Expectation on Field Recognition Accuracy

- For digital-native government PDFs (like our sample docs): field extraction can be **high accuracy** because the text is clean and table-structured — but it requires **table-aware parsing** (row/column position matters, e.g. via `pdfplumber`'s table extraction), not just regex on a flat text blob, because the same document has repeating rows (one per owner, one per parcel) that must be correctly grouped.
- For genuinely legacy/handwritten/scanned records (what the original problem statement describes): accuracy will be meaningfully lower, and the human-review workflow (Section 8–9) is not optional polish — it is the core mechanism that makes the system usable in practice. This is true of real-world DILRMP digitization efforts as well; no OCR/NLP pipeline gets legacy handwritten records to near-100% automatically.
- **For the hackathon demo**, leaning on realistic digital-native or clean-scanned documents (like our two samples) is the right call — it lets the pipeline show genuinely high accuracy live, while the review/correction UI demonstrates awareness of the harder legacy-record case.

---

## 4. Hackathon Prototype Scope (MVP — What We're Actually Building)

**Framing for this version:** This PRD describes **V1** — the hackathon prototype, scoped to what can be built and demoed working end-to-end in the available time, using the two real sample document types (Bhu-Adhikar Pustika, Khatoni B-1) as the primary test fixtures. Section 18 below lists **V2 features** — the natural next steps that would be added later (broader document types, GIS, multilingual support beyond Hindi/English, government system integration, etc.) — so the team has a clear roadmap without those features creating scope creep in V1.

Because this is an **internal hackathon prototype**, not the full government-scale product, scope is deliberately narrowed to what can be demoed live and works end-to-end.

### In Scope (MUST WORK)
1. Document upload (image/PDF of a real land record)
2. OCR text extraction (printed text primary; handwritten as best-effort)
3. Rule-based + NLP field extraction into predefined structured fields
4. Confidence score per field
5. Editable review screen (human-in-the-loop correction for low-confidence fields)
6. Save to database (MySQL)
7. Records list/table view with search
8. Basic validation rules (format checks, duplicate khasra/survey number detection)
9. Dashboard with processing stats (documents processed, avg. confidence, pending review count)

### Out of Scope (Do NOT build — mention as "future scope" only)
- Actual integration with real DILRMP/LRMS/GIS government APIs (mock/placeholder only if needed)
- GIS map rendering of cadastral plots (skip entirely for MVP)
- Multi-user auth / role-based access control (single-user is fine for demo)
- Production-grade security, encryption, audit logs
- Training a custom OCR/handwriting model from scratch
- Multilingual support for all Indian languages — support **Hindi + English** only for MVP (this covers most real documents and is realistic to demo)

---

## 5. Users (Prototype Context)

Single persona for hackathon demo purposes:
- **Operator/Clerk**: uploads a document, reviews AI-extracted fields, corrects if wrong, saves record.
- (Optionally, for demo flair) **Admin/Viewer**: views dashboard with aggregate stats.

No need to build separate login systems — a simple UI mode toggle ("Upload" vs "Dashboard") is enough.

---

## 6. End-to-End Workflow

```
┌─────────────┐   ┌───────────────┐   ┌────────────┐   ┌──────────────────┐   ┌──────────────┐
│   Upload    │──▶│ Detect: has   │──▶│  Extract   │──▶│  Field Extraction │──▶│  Validation  │
│ (image/PDF) │   │ text layer?   │   │  text      │   │ (table-aware      │   │ (rules +     │
│             │   │ digital PDF   │   │ (pdfplumber│   │  regex + spaCy)   │   │  duplicate   │
│             │   │  vs scanned   │   │  or OCR    │   │  → Khata + owners │   │  check)      │
│             │   │               │   │  fallback) │   │  + parcels        │   │              │
└─────────────┘   └───────────────┘   └─────┬──────┘   └──────────────────┘   └──────┬───────┘
                                             │
                                    ┌────────▼─────────┐
                                    │ Low OCR confidence │
                                    │ or poor quality/   │
                                    │ handwritten?        │
                                    │ → Google Vision API  │
                                    │ fallback (same text- │
                                    │ layer output shape,   │
                                    │ still goes through own│
                                    │ regex+spaCy layer)    │
                                    └──────────────────────┘
                                                                        │
                            ┌───────────────────────────────────────────┘
                            ▼
                  ┌───────────────────┐     ┌─────────────┐     ┌───────────────┐
                  │  Review Screen     │────▶│  Save to    │────▶│  Dashboard /  │
                  │ (confidence-based  │     │  MySQL DB   │     │  Records List │
                  │  highlighting +    │     │             │     │               │
                  │  manual edit)      │     │             │     │               │
                  └───────────────────┘     └─────────────┘     └───────────────┘
```

**Step-by-step:**
1. User uploads a scanned image/PDF via React frontend.
2. Frontend sends file to Python backend via REST API.
3. Backend runs OCR → gets raw text (+ optionally bounding boxes).
4. Backend runs field extraction (regex patterns + NLP) → gets structured JSON with a confidence score per field.
5. Backend runs validation rules → flags issues (missing field, bad format, duplicate).
6. Backend returns structured JSON to frontend.
7. Frontend displays an editable form pre-filled with extracted values; low-confidence fields (< threshold, e.g., 70%) are visually highlighted (yellow/red).
8. User reviews/corrects fields, clicks "Save".
9. Frontend sends final (possibly corrected) data to backend → saved in MySQL.
10. Records appear in "All Records" table and update dashboard stats.

### 6.1 Hybrid Extraction Strategy (Tesseract Primary + Google Cloud Vision API Fallback)

**Important design principle:** The system must remain a genuine OCR + NLP engineering pipeline — not a thin wrapper around a general-purpose LLM. Field extraction and classification are always done by the project's own regex + spaCy layer (Section 8), regardless of which OCR engine produced the raw text. No engine is ever asked to "just return the final fields" directly — that would reduce the system to an API call and undercut both the technical depth the problem statement is asking for (it explicitly suggests OpenCV, spaCy, Indic NLP Library as the intended stack) and the government's practical cost/scalability needs (token-based LLM pricing does not scale well to lakhs of documents; a dedicated OCR API is cheaper and more predictable per page).

To balance cost, speed, and accuracy, the pipeline uses a **two-tier OCR approach**:

**Tier 1 — Tesseract (default, free, offline, fast):**
- Used for: digital-native PDFs (direct text extraction via `pdfplumber`/`PyMuPDF`, no OCR needed at all — this covers our two real sample documents) AND clean scanned/printed images.
- Runs first, always. Zero marginal cost, no data ever leaves the machine — best option for the majority of well-formed documents and the most defensible for a government deployment handling sensitive ownership data.

**Tier 2 — Google Cloud Vision API (fallback, used selectively, not by default):**
- Triggered automatically when ANY of these conditions are true after Tier 1 runs:
  - Tesseract's average OCR confidence for the page is below a threshold (e.g., < 60%)
  - A **required** field (owner_name, khata_number, village, district — see Section 8) could not be extracted at all after the regex/NLP layer ran on Tesseract's output
  - The image is genuinely low-quality (faded, skewed even after OpenCV correction, poor scan) where Tesseract is known to struggle
  - The document appears to contain handwritten annotations, where Vision API's `DOCUMENT_TEXT_DETECTION` mode has meaningfully better handwriting support than Tesseract
- When triggered: send the document image to Vision API's `DOCUMENT_TEXT_DETECTION` endpoint, which returns raw text plus per-word confidence and bounding boxes — the same shape of output Tesseract produces. This raw output is then run through the **exact same** regex + spaCy field-extraction layer as Tier 1 (Section 8) — the extraction logic is engine-agnostic, which is the correct architecture: swap the OCR engine, keep the intelligence layer constant.

**Why this is a better story than an LLM-wrapper approach:** it demonstrates the team built and owns the actual extraction intelligence (regex patterns + NLP rules tuned on real MP land record layouts), while using OCR as a commodity input source that can be swapped or upgraded. It also mirrors how a real government deployment would think about cost: Tesseract handles the bulk of documents for free, and Vision API's pay-per-image pricing (with a monthly free tier) is only spent on the harder minority — a defensible operating cost model at DILRMP scale, unlike per-token LLM pricing.

**Cost/ops note for Antigravity:** Vision API calls should be logged (which documents triggered fallback, and why) so the team can show, in the dashboard, what fraction of documents needed the fallback — this is itself a useful metric for the pitch, and also a realistic operating-cost indicator.

**Note for V2 (not required now):** For a real production deployment, pure on-premise/offline operation (Tesseract-only, or a self-hosted Indic OCR model, on NIC Cloud/MeghRaj infrastructure) would avoid sending any citizen land-ownership data to a third-party cloud API at all — a genuine data-sovereignty consideration for government land records. Worth mentioning to mentors as a known trade-off of the V1 approach, not something to solve now.

---

## 7. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React (Vite), Axios, TailwindCSS | Clean, simple UI — no need for heavy component libraries |
| Backend | Python, FastAPI | FastAPI preferred over Flask — auto docs (Swagger UI) help testing during vibe-coding |
| PDF Text Extraction | `pdfplumber` or `PyMuPDF (fitz)` | For digital-native PDFs (like the certified mpbhulekh.gov.in copies) — try this FIRST; apply `unicodedata.normalize('NFC', text)` on output to fix Devanagari ligature issues |
| OCR Engine (primary fallback) | Tesseract OCR (pytesseract) with `hin`+`eng` trained data | Used when a page has no usable text layer (i.e., it's a scanned image) — free, offline, fast |
| Extraction Fallback (secondary) | Google Cloud Vision API (`DOCUMENT_TEXT_DETECTION`) | Used only when Tesseract's OCR confidence is low or the image quality is genuinely poor (faded, skewed, or contains handwriting) — returns raw text + confidence, same shape as Tesseract's output, still passed through the project's own regex+spaCy extraction layer (not asked to return final fields directly); see Section 6.1 for the decision logic |
| Image Preprocessing | OpenCV | Deskew, denoise, binarize scanned images before OCR — significantly improves OCR accuracy (only needed for the OCR fallback path) |
| Table Parsing | `pdfplumber` table extraction | Needed because real documents are table-structured with repeating owner/parcel rows, not flat text — plain regex on a text blob will not correctly group multi-row data |
| Field Extraction | Python `re` (regex) + spaCy (NER, rule-based `Matcher`) | Regex handles labeled fields ("Khasra No: 245"); spaCy helps with names/unlabeled text |
| Database | MySQL | Use SQLAlchemy ORM in FastAPI for clean models |
| File Storage | Local filesystem (`/uploads` folder) for prototype | No need for S3/cloud storage in MVP |
| Dashboard Charts | Chart.js or Recharts (React) | Simple bar/pie charts for stats |
| Dev/Run | Docker Compose (optional but recommended) | One command spins up frontend + backend + MySQL — makes demo setup painless |

---

## 8. Target Extracted Fields (Data Schema) — Revised After Real Document Analysis

**This section supersedes any earlier flat field list.** Based on the two real sample documents (Bhu-Adhikar Pustika Form 4, Khatoni B-1 Form 7), the correct structure is **hierarchical, not flat**: one document = one Khata header + a list of owners + a list of parcels. The extraction engine must return this shape, not a single flat object.

### 8.1 Khata-Level Fields (appear once per document)

| Field Name | Hindi Label in Document | Example | Required? |
|---|---|---|---|
| clrm_no | CLRM No | "25030879728" | Yes — this is the unique document identifier |
| bhoomiswami_samagra_id | भूमिस्वामी समग्र आईडी क्रमांक | (often blank) | Optional |
| village | ग्राम / नगर का नाम | "सिमरिया" | Yes |
| patwari_halka_no | पटवारी हल्का क्रमांक / सेक्टर क्रमांक | "सिमरिया" | Optional |
| tehsil | तहसील | "सिमरिया" | Yes |
| district | जिला | "पन्ना" | Yes |
| state | (implicit from document title) | "मध्य प्रदेश" | Optional — inferred from document template, not always printed per-field |
| khata_number | खाता संख्यांक / खाता क्रमांक | "2305" | Yes — this is the primary grouping key |
| fasli_year | वर्ष | "2026-2027" | Yes |
| document_type | (inferred from form title) | "Bhu-Adhikar Pustika (Form 4)" / "Khatoni B-1 (Form 7)" | Yes — determines which extraction template to apply |

### 8.2 Owner-Level Fields (repeating — one entry per co-owner in the Khata)

| Field Name | Hindi Label | Example | Notes |
|---|---|---|---|
| owner_name | भूमिस्वामी-नाम / खातेदार का नाम | "कीर्ति सेन" | |
| parent_or_spouse_name | माता / पिता / पति का नाम | "मन्नू लाल सेन" | Extracted from "पुत्री/पुत्र ... सेन" pattern |
| address | पता | "सिमरिया सिमरिया पन्ना मध्य प्रदेश" | Often just village/tehsil/district repeated |
| share_fraction | अंश / हिस्सा | "1/15" | Critical field — determines ownership percentage |
| ownership_status | (label under name) | "भूमि स्वामी" (Bhumiswami) | Type of right holder |
| owner_id_no | खातेदार का आईडी क्रमांक | (often blank in specimen) | Optional |

### 8.3 Parcel-Level Fields (repeating — one entry per survey number in the Khata)

| Field Name | Hindi Label | Example | Notes |
|---|---|---|---|
| parcel_unique_id | भूमि के भाग की यूनिक आईडी | "1110820173 / 828R0YDCS4MUH0" | Long alphanumeric — treat as string, don't validate as pure numeric |
| survey_number | सर्वेक्षण संख्यांक / भू-खण्ड संख्यांक | "96/1 (S)" | The "(S)" / "(P)" suffix means Sarvekshan(agri)/non-agri — must be parsed separately as `land_use_flag` |
| area_hectare | क्षेत्रफल (हेक्टेयर में) | "0.1070" | Always in hectares in this document type — do not assume acres |
| land_use | भूमि उपयोग | "कृषि" (Agricultural) | |
| land_revenue_rs | भू-राजस्व (रुपए में) | "0.30" | |

### 8.4 API Response Shape

Every value must carry a confidence score, and owners/parcels must be arrays:

```json
{
  "khata": {
    "clrm_no": { "value": "25030879728", "confidence": 0.97 },
    "village": { "value": "सिमरिया", "confidence": 0.93 },
    "tehsil": { "value": "सिमरिया", "confidence": 0.93 },
    "district": { "value": "पन्ना", "confidence": 0.95 },
    "khata_number": { "value": "2305", "confidence": 0.96 },
    "fasli_year": { "value": "2026-2027", "confidence": 0.9 }
  },
  "owners": [
    { "owner_name": { "value": "कल्पना सेन", "confidence": 0.88 },
      "parent_or_spouse_name": { "value": "किशना उर्फ़ किशुनदास सेन", "confidence": 0.7 },
      "share_fraction": { "value": "1/3", "confidence": 0.85 } },
    { "owner_name": { "value": "दीपाली सेन", "confidence": 0.9 },
      "parent_or_spouse_name": { "value": "मन्नू लाल सेन", "confidence": 0.85 },
      "share_fraction": { "value": "1/15", "confidence": 0.85 } }
  ],
  "parcels": [
    { "survey_number": { "value": "96/1 (S)", "confidence": 0.92 },
      "area_hectare": { "value": "0.1070", "confidence": 0.9 },
      "land_use": { "value": "कृषि", "confidence": 0.8 },
      "land_revenue_rs": { "value": "0.30", "confidence": 0.75 } }
  ]
}
```

This structure is important — the frontend Review page (Section 13) must render a header form (Khata fields) plus **two editable tables**: one for owners, one for parcels — not a single flat form.

---

## 9. Confidence Scoring Logic (Keep It Simple)

Don't overengineer this. A practical approach for a hackathon:

- Take the OCR engine's own per-word/per-line confidence score (Tesseract provides this natively via `pytesseract.image_to_data`).
- For a field extracted via regex match, confidence = average OCR confidence of the matched text region.
- If a field could not be found at all → confidence = 0, value = null.
- Threshold for "needs review": confidence < 70% → highlight red; 70–90% → highlight yellow; >90% → green/no highlight.

---

## 10. Validation Rules (Rule-Based, Not ML)

Simple, explainable rules — good for demo storytelling:

1. **Required field check** — owner_name, survey_number, plot_area, village, district must not be empty.
2. **Format check** — survey/khasra number should be alphanumeric with optional `/`; plot_area should contain a number + unit (acre/hectare/sq.ft).
3. **Duplicate detection** — before saving, check if a Khata with the same `clrm_no` (strongest signal — it's a unique certified-copy ID), OR the same `khata_number` + `village` + `tehsil` combination, already exists in DB → flag as "Possible Duplicate" (don't block save, just warn). Checking `clrm_no` alone is not sufficient as a general rule for future document types that may lack it — always pair with khata_number + village as a fallback.
4. **Date sanity check** — document_date should not be a future date.

---

## 11. Database Schema (MySQL) — Revised for Real Khata/Parcel/Owner Structure

The earlier flat `land_records` table is replaced with three related tables reflecting the real one-Khata-to-many-owners-to-many-parcels structure confirmed in Section 3.1.

```sql
CREATE TABLE documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    original_filename VARCHAR(255),
    file_path VARCHAR(500),
    document_type VARCHAR(50),          -- 'bhu_adhikar_pustika' / 'khatoni_b1' / 'other'
    source_mode ENUM('digital_text', 'ocr') DEFAULT 'digital_text',  -- which extraction path was used
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    raw_extracted_text LONGTEXT,
    processing_status ENUM('processing', 'completed', 'failed') DEFAULT 'processing'
);

-- One row per Khata (the account-level record extracted from a document)
CREATE TABLE khatas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    document_id INT,
    clrm_no VARCHAR(50),
    clrm_no_confidence FLOAT,
    khata_number VARCHAR(50),
    khata_number_confidence FLOAT,
    village VARCHAR(255),
    village_confidence FLOAT,
    patwari_halka_no VARCHAR(100),
    tehsil VARCHAR(255),
    tehsil_confidence FLOAT,
    district VARCHAR(255),
    district_confidence FLOAT,
    state VARCHAR(255),
    fasli_year VARCHAR(20),
    is_duplicate_flag BOOLEAN DEFAULT FALSE,
    review_status ENUM('pending_review', 'verified') DEFAULT 'pending_review',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id)
);

-- One row per co-owner within a Khata (repeating group)
CREATE TABLE khata_owners (
    id INT AUTO_INCREMENT PRIMARY KEY,
    khata_id INT,
    owner_name VARCHAR(255),
    owner_name_confidence FLOAT,
    parent_or_spouse_name VARCHAR(255),
    address VARCHAR(500),
    share_fraction VARCHAR(20),          -- e.g. "1/15"
    share_fraction_confidence FLOAT,
    ownership_status VARCHAR(100),       -- e.g. "भूमि स्वामी"
    owner_id_no VARCHAR(100),
    FOREIGN KEY (khata_id) REFERENCES khatas(id)
);

-- One row per survey-number parcel within a Khata (repeating group)
CREATE TABLE khata_parcels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    khata_id INT,
    parcel_unique_id VARCHAR(100),
    survey_number VARCHAR(50),
    survey_number_confidence FLOAT,
    land_use_flag CHAR(1),               -- 'S' (agricultural) or 'P' (non-agricultural)
    area_hectare DECIMAL(10,4),
    area_hectare_confidence FLOAT,
    land_use VARCHAR(100),               -- e.g. "कृषि"
    land_revenue_rs DECIMAL(10,2),
    FOREIGN KEY (khata_id) REFERENCES khatas(id)
);
```

*(Antigravity should generate SQLAlchemy models matching this three-table shape — one parent `Khata` with two child collections `owners` and `parcels` — rather than a single flat table. This is the single most important correction from the earlier draft of this PRD.)*

---

## 12. Backend API Design (FastAPI)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/upload` | POST | Accepts file (multipart/form-data), runs OCR + extraction pipeline, returns structured JSON with confidence scores (does NOT save to DB yet) |
| `/api/records` | POST | Saves final (user-reviewed/corrected) record to DB |
| `/api/records` | GET | Returns list of all saved records (for table view) |
| `/api/records/{id}` | GET | Returns single record detail |
| `/api/records/{id}` | PUT | Update/correct an existing record |
| `/api/dashboard/stats` | GET | Returns aggregate stats: total documents, avg confidence, pending review count, records by district |

All endpoints should return proper JSON with clear error messages on failure (e.g., unsupported file type, OCR failure).

---

## 13. Frontend Pages (React)

1. **Upload Page** (`/`)
   - Drag-and-drop or file picker (accept .jpg, .png, .pdf)
   - "Process Document" button
   - Loading state while backend processes
   - On success → navigates to Review Page with extracted data

2. **Review Page** (`/review`)
   - Form showing all extracted fields, pre-filled
   - Each field has a colored border/badge based on confidence (green/yellow/red)
   - All fields editable
   - "Save Record" button → calls `POST /api/records`
   - Show original uploaded image side-by-side with the form (helps user visually verify — good demo touch)

3. **Records List Page** (`/records`)
   - Table of all saved records (searchable/filterable by village, district)
   - Click a row → view detail / edit

4. **Dashboard Page** (`/dashboard`)
   - Cards: Total Documents Processed, Average Confidence, Pending Review Count
   - Simple bar chart: records by district
   - Simple pie chart: verified vs pending review

---

## 14. Image Preprocessing Notes (Important for Real Documents)

Since real scanned/photographed land documents will be used, raw OCR accuracy will be poor without preprocessing. Antigravity should implement this pipeline in the OCR step using OpenCV before passing to Tesseract:

1. Convert to grayscale
2. Denoise (`cv2.fastNlMeansDenoising`)
3. Adaptive thresholding / binarization
4. Deskew (correct rotation/tilt)
5. Optionally resize/upscale if resolution is low

This single step will make the biggest visible difference in demo quality — prioritize it.

---

## 15. Phased Build Plan (Give This to Antigravity As Sequential Steps)

Don't ask Antigravity to build everything in one shot. Instructions should be given in phases, and each phase should be confirmed working before moving to the next.

**Phase 1 — Project Setup**
- Set up folder structure: `/frontend` (React) and `/backend` (FastAPI)
- Set up MySQL connection, create tables from schema above
- Basic health-check endpoint (`/api/ping`) and confirm frontend can call backend

**Phase 2 — OCR Pipeline (Backend Only, Test via Swagger UI first)**
- Build `/api/upload` endpoint: accept file → save to `/uploads` → run OpenCV preprocessing → run Tesseract OCR → return raw extracted text
- Test with 2–3 real sample documents before moving on

**Phase 3 — Field Extraction**
- Add regex + spaCy-based field extraction on top of raw OCR text
- Return structured JSON with confidence scores (per field 8. Data Schema)
- Test against real documents, tune regex patterns based on actual OCR output format

**Phase 3.5 — Google Cloud Vision API Fallback Integration**
- Implement the decision logic from Section 6.1 (confidence threshold / missing required field / poor image quality → trigger fallback)
- Build the Vision API call using `DOCUMENT_TEXT_DETECTION` mode — it returns raw text + confidence, same shape as Tesseract's output
- Feed Vision API's output through the **same** regex + spaCy extraction layer used for Tesseract's output (do not let Vision API or any external service produce final structured fields directly — the extraction logic must remain the project's own code)
- Test by deliberately using a lower-quality/harder image to confirm the fallback actually triggers and produces usable text
- Log every fallback trigger (document id + reason) so the dashboard can later show "% of documents needing OCR fallback"

**Phase 4 — Validation Rules**
- Add rule checks (required fields, format checks, duplicate detection)
- Include validation warnings in the API response

**Phase 5 — Frontend: Upload + Review Screens**
- Build Upload page → connect to `/api/upload`
- Build Review page with confidence-based highlighting and edit capability
- Connect "Save" to `/api/records` POST

**Phase 6 — Records List + Dashboard**
- Build Records List page (GET `/api/records`)
- Build Dashboard page (GET `/api/dashboard/stats`)

**Phase 7 — Polish for Demo**
- Error handling (bad file type, OCR failure messages)
- Loading states/spinners
- Basic responsive styling
- Seed DB with a few sample records so dashboard doesn't look empty on first launch

---

## 16. What Else to Give Antigravity (Beyond This PRD)

To make vibe-coding go smoothly and avoid Antigravity guessing wrong things, also provide:

1. **3–5 real sample documents** (the actual land records you have) — upload them into the project folder as test fixtures (e.g., `/backend/sample_docs/`) early on, and explicitly tell Antigravity to test the OCR/extraction pipeline against these real files at each phase, not just dummy text. This is the single most important thing — without real test files, it'll build against assumptions and break on your real demo data.
2. **A sample of the raw OCR output** from one of your documents (run Tesseract manually once, paste the raw text) so Antigravity can design regex patterns around your actual document's real layout/wording rather than guessing generic patterns.
3. **Explicit environment info**: Python version, Node version, whether Tesseract is already installed locally or needs `apt install tesseract-ocr`, MySQL credentials/connection string to use for local dev, and a **Google Cloud Vision API key/service account** (Google Cloud offers a monthly free tier of Vision API calls, sufficient for hackathon-scale testing) set as an environment variable, never hardcoded.
4. **A one-line "definition of done" for each phase** — e.g., "Phase 2 is done when I can POST a real image to /api/upload via Swagger UI and get back raw OCR text in the response." This stops the agent from marking things complete prematurely.
5. **Explicit instruction: "After each phase, stop and show me how to test it before continuing."** This keeps you in the loop and catches issues early instead of at the very end.
6. **Say clearly: "Do not use mock/hardcoded data anywhere — always run the real OCR/extraction pipeline, even if accuracy is imperfect."** Vibe-coding tools sometimes take shortcuts (stub data) to make a demo "look" done — explicitly forbidding this avoids that trap.
7. **A short list of what NOT to build** (copy Section 3's "Out of Scope" list) — this prevents scope creep and wasted time on GIS maps, multi-language support, auth systems etc.

---

## 17. Demo Script (For the Judges/Mentors)

Useful to write this now so the build stays demo-focused:

1. "Here's a real land record document" → upload it live
2. Show OCR processing happening (not instant — show it's real work)
3. Show extracted fields appear with confidence scores — point out one low-confidence field
4. Manually correct that one field → Save
5. Go to Records page → show it's saved
6. Go to Dashboard → show stats updated live
7. (Bonus) Upload a second document with a duplicate survey number → show duplicate warning trigger

---

## 18. Success Criteria for This Prototype

- [ ] Can upload a real scanned/photographed land document
- [ ] OCR genuinely extracts text from it (not hardcoded)
- [ ] At least 6 of the 14 fields are correctly auto-populated on a typical clear document
- [ ] Confidence scores are shown and meaningfully differ between certain/uncertain fields
- [ ] User can correct and save a record
- [ ] Records persist in MySQL and show in a list view
- [ ] Dashboard reflects real counts from the database
- [ ] Duplicate detection triggers correctly on a repeated survey number

---

## 19. V2 Roadmap (Not to Build Now — Just So Scope Stays Disciplined in V1)

Once the V1 prototype is working and demoed, these are the natural next additions:

- Support for more document types beyond Bhu-Adhikar Pustika / Khatoni B-1 (e.g., Adhikar Abhilekh Form 3, mutation registers, Bhu-Naksha map linkage)
- Genuine handwritten legacy register support (older photocopied/handwritten documents), including a properly evaluated OCR accuracy benchmark
- Multilingual support beyond Hindi/English (other regional languages per DILRMP scope)
- Real integration with DILRMP/LRMS/GIS government APIs instead of placeholder fields
- GIS map rendering of parcels using Bhu-Naksha-style cadastral maps
- Multi-user auth, role-based access control, and audit logging for production use
- A trained NER model (fine-tuned on Indian land record text) replacing the current regex + rule-based extraction for better generalization across document layouts
- Automated feedback loop: corrections made during human review feed back into improving extraction rules/model over time (point 13 from the original problem statement)

---

## 20. Sample Test Documents on Hand

Two real certified copies (from mpbhulekh.gov.in, village Simariya, tehsil Simariya, district Panna, Madhya Pradesh) are available as test fixtures and should be placed in `/backend/sample_docs/` on day one:

1. `CertifiedCopy_Bhu-AdhikarPustika_25030879728.pdf` — Form 4, Khata 2305, 8 co-owners, 8 parcels
2. `CertifiedCopy_Khatoni_B1_Copy_25030868731.pdf` — Form 7, same Khata 2305, cross-referenced revenue/demand columns

Both are **digital-native PDFs** (confirmed by direct text-layer extraction, not scanned images) — so Phase 2 of the build plan should start with `pdfplumber`/`PyMuPDF` text extraction on these two files (not OCR) as the very first working milestone, since it will succeed fast and prove the rest of the pipeline. The OCR fallback path (Section 6, 14) should be built and tested separately against a genuinely scanned/photographed document if one becomes available — don't assume the OCR path works just because the text-extraction path does; they are different code paths with different accuracy profiles.

---

*End of PRD.*

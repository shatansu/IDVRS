# Phase 4 Walkthrough: Validation Rules

**Intelligent Land Record Digitization & Validation System** (SIH 26018)  
Phase 4 has been completed and verified against both real certified sample documents including duplicate detection.

---

## 1. What Was Built in Phase 4

### A. Validation Engine (`/Backend/app/pipeline/validator.py`)

Four PRD Section 10 rules, all implemented:

| Rule | Type | Description |
|------|------|-------------|
| **Required field check** | Error | `khata_number`, `village`, `tehsil`, `district` must be present; at least one owner with a name required |
| **Format check** | Error/Warning | `survey_number` must match `digits[/digits] [(S/P)]`; `area_hectare` must be positive float; `land_revenue_rs` must be ≥ 0 |
| **Date sanity** | Error/Warning | `fasli_year` must match `YYYY-YYYY`, end year = start+1, not future beyond `current_year+1`, not before 1950 |
| **Duplicate detection** | Warning (never blocks save) | DB lookup: same `clrm_no` (strongest) OR same `khata_number + village + tehsil` (fallback); warns, does not block |

`clrm_no` missing is a **warning** (not error) — duplicate detection falls back to composite key.

### B. API Integration (`/Backend/app/api/upload.py`)
`POST /api/upload` now runs `validate_extraction()` before saving and includes a `validation` object inside `structured_data`:

```json
"structured_data": {
  "khata": { ... },
  "owners": [ ... ],
  "parcels": [ ... ],
  "extraction_meta": { ... },
  "validation": {
    "passed": true,
    "errors": [],
    "warnings": [],
    "is_duplicate": false,
    "duplicate_matches": []
  }
}
```

---

## 2. Real Validation Test Results

### TEST 1 — First upload of both documents

#### DOC1: Bhu-Adhikar Pustika (`25030879728`)
```
passed      : True
is_duplicate: False
errors      : 0
warnings    : 0
```
✅ Clean first upload — no issues.

#### DOC2: Khatoni B-1 (`25030868731`)
```
passed      : True
is_duplicate: True
errors      : 0
warnings    : 1
  ⚠️ [duplicate_detection] khata:
     Possible duplicate: 1 matching record(s) found.
     Match reasons: khata_number+village+tehsil.
     Record will still be saved — please verify manually.
```
✅ Expected — both real documents are for the same Khata 2305, village Simariya. Different `clrm_no` (different certified copies of the same khata) but same composite key → correctly flagged as warning only.

---

### TEST 2 — Duplicate detection: upload DOC1 again

```
passed      : True
is_duplicate: True
errors      : 0
warnings    : 1
  ⚠️ [duplicate_detection] khata:
     Possible duplicate: 2 matching record(s) found.
     Match reasons: clrm_no, khata_number+village+tehsil.

duplicate_matches:
  → khata_id=1  clrm_no=25030879728  reason=clrm_no
  → khata_id=2  clrm_no=25030868731  reason=khata_number+village+tehsil
```
✅ **Duplicate correctly detected** — both `clrm_no` match AND composite key match triggered on the second upload.

---

## 3. Validation Output Shape (in API response)

```json
"validation": {
  "passed": false,
  "errors": [
    {
      "rule": "required_field",
      "field": "khata_number",
      "message": "Required field 'खाता संख्यांक' (khata_number) is missing or empty."
    }
  ],
  "warnings": [
    {
      "rule": "duplicate_detection",
      "field": "khata",
      "message": "Possible duplicate: 1 matching record(s) found in database. Match reasons: clrm_no. Record will still be saved — please verify manually."
    }
  ],
  "is_duplicate": true,
  "duplicate_matches": [
    {
      "khata_id": 1,
      "clrm_no": "25030879728",
      "khata_number": "2305",
      "village": "सिमरिया",
      "match_reason": "clrm_no"
    }
  ]
}
```

---

## 4. Files Created/Modified in Phase 4

| File | Change |
|------|--------|
| [`Backend/app/pipeline/validator.py`](file:///d:/SIH-Prototype_IDVRS/Backend/app/pipeline/validator.py) | **NEW** — validation engine |
| [`Backend/app/api/upload.py`](file:///d:/SIH-Prototype_IDVRS/Backend/app/api/upload.py) | **MODIFIED** — runs `validate_extraction()`, includes `validation` in response |

---

> [!NOTE]
> Phase 4 complete. **Phase 5 — Frontend: Upload + Review Screens** can proceed when ready.

# IDVRS Project — Comprehensive Session Summary & Handoff Guide

> **Purpose of this document**: This file provides a complete, unified summary of all discussions, architectural decisions, completed implementations, constraints, and current system states across the IDVRS (Intelligent Document Verification and Registry System) project.  
> **Use this file when starting a new chat session** to immediately restore full context without losing any prior instructions.

---

## 1. Project Overview & Tech Stack

**IDVRS** is an AI-assisted Land Record Digitization, Verification, and Cadastral GIS Platform built for the Smart India Hackathon (SIH).

- **Backend**: Python 3.11, FastAPI, Uvicorn, SQLAlchemy / PyMySQL, Tesseract OCR.
  - Port: `http://127.0.0.1:8000`
- **Database**: Local MySQL 8.x (`land_record_db`).
  - Tables: `documents`, `khatas`, `khata_owners`, `khata_parcels`.
- **Frontend**: React 18 + Vite, Tailwind CSS, Lucide React icons, Leaflet + React-Leaflet.
  - Port: `http://localhost:5173`
- **GIS Engine**: GeoJSON (WGS 84 / `EPSG:4326`), OpenStreetMap raster base layer, spatial-to-relational cross-matching engine.

---

## 2. Core User Directives & Constraints (Strict Rules)

1. **No Dummy / Seed Data in Database**:
   - **Rule**: Do **NOT** run any automated seed scripts or insert fake dummy records into MySQL.
   - **Reason**: The user will perform live hackathon demos by uploading actual scanned land records, images, and documents. The database must only contain user-uploaded or explicitly verified records.

2. **Separation of Identifiers (`khata_id` vs `khata_number`)**:
   - **Database PK (`khata_id`)**: Internal auto-increment integer primary key (e.g., `3`). Used in internal URLs like `/records/3` or `/api/records/3`.
   - **Official Revenue Number (`khata_number`)**: User-facing string extracted from the document (e.g., `"2305"`).
   - **Rule**: Never conflate the two in UI displays or search fields.

3. **5-Part Spatial Matching Key**:
   - Cross-matching spatial cadastral polygons with MySQL records requires all 5 administrative keys:
     $$\text{Key} = (\text{state}, \text{district}, \text{tehsil}, \text{village}, \text{survey\_no})$$
   - Matches are never evaluated on `survey_no` or `village` alone.

4. **Area Integrity**:
   - The authoritative official land area displayed in the UI must strictly be the `recorded_area_hectare` from MySQL.
   - The spatial polygon area is explicitly labeled as **`"Not calculated"`** to avoid presenting synthetic GeoJSON polygon areas as authoritative.

5. **Cadastral Provenance & Disclaimer**:
   - Polygons are prototype/demo polygons using survey numbers from sample land records.
   - **Rule**: Never describe demo polygons as "real government cadastral maps".
   - The mandatory disclaimer banner must remain visible on the map:
     > *"⚠️ प्रोटोटाइप स्थानिक डेटा सूचना (Prototype GIS Notice): यहाँ प्रदर्शित खसरा सीमाएं नमूना भूमि अभिलेखों के खसरा नंबरों पर आधारित सिंथेटिक / प्रोटोटाइप ज्यामिति (Demo Geometry) हैं। यह कोई आधिकारिक सरकारी भू-नक्शा सीमा नहीं है।"*
   - Engineering Principle: **"BUILD THE ENGINE NOW, PLUG AUTHORITATIVE DATA LATER."**

6. **Environment & Configuration (.env)**:
   - Backend relies on `app/core/config.py` (Pydantic `BaseSettings`), which supplies safe local defaults (`localhost`, `root`, port `3306`, etc.) even if specific keys are absent from `.env`.

7. **Multilingual / NLP Context**:
   - Current extraction pipeline uses regex and pattern heuristics optimized for Hindi / MP Land Records (Khasra, Bhu-Adhikar Pustika).
   - Pluggable NLP / LLM architectures can be introduced in future phases for multi-language document recognition across different states.

---

## 3. Architecture & Completed Components

```
d:\SIH-Prototype_IDVRS\
├── Backend\
│   ├── app\
│   │   ├── api\
│   │   │   ├── documents.py       # Upload & OCR ingestion endpoints
│   │   │   ├── gis.py             # GIS / Cadastral Map REST API (parcels, holdings, hierarchy)
│   │   │   ├── records.py         # Land records registry & detail query endpoints
│   │   │   ├── upload.py          # Document file handling
│   │   │   └── verification.py    # Verification & validation endpoints
│   │   ├── core\
│   │   │   └── config.py          # Pydantic settings with sensible defaults
│   │   ├── gis_data\
│   │   │   └── cadastral_demo.geojson # 11 Contiguous demo polygons (EPSG:4326) for Simariya
│   │   ├── models.py              # SQLAlchemy ORM models (khatas, parcels, owners, documents)
│   │   ├── main.py                # FastAPI app initialization, CORS, router mounting
│   │   └── init_db.py             # Schema initialization utility
├── Frontend\
│   ├── src\
│   │   ├── pages\
│   │   │   ├── GISPage.jsx        # Interactive Leaflet Cadastral Map Engine
│   │   │   ├── RecordDetailPage.jsx # Land Record detail view with "View on Map" navigation
│   │   │   ├── RecordsListPage.jsx  # Registry table with filters and search
│   │   │   ├── ReviewPage.jsx     # Extraction verification & edit screen
│   │   │   ├── UploadPage.jsx     # Document upload & real-time OCR trigger
│   │   │   └── DashboardPage.jsx  # Executive KPIs & summary charts
│   │   └── App.jsx                # Router, Navigation bar, and layout shell
├── PRD&Walkthrough\
│   └── Walkthrough\
│       ├── walkthrough_gis.md     # Full GIS walkthrough and acceptance verification
│       └── walkthrough_phase*.md  # Phases 1 through 7 walkthroughs
├── GIS_guide.md                   # Complete GIS Architecture Specification & PRD
└── README.md                      # Comprehensive project documentation
```

### Key GIS Endpoints Implemented (`/api/gis`)
- `GET /api/gis/parcels`: Returns GeoJSON `FeatureCollection` with runtime MySQL status (`MATCHED`, `UNMATCHED`, `AMBIGUOUS`).
  - Supports filters: `village`, `district`, `survey_no`, `khata_id`, `khata_number`, `q`.
- `GET /api/gis/parcels/{parcel_id}`: Returns enriched single parcel feature.
- `GET /api/gis/khata/{khata_id}`: Returns all spatial parcels belonging to a given Khata holding.
- `GET /api/gis/hierarchy`: Returns available administrative levels (States, Districts, Tehsils, Villages).

### Key Frontend GIS Features (`/gis`)
- **Map Viewer**: Leaflet-based interactive canvas with OpenStreetMap tiles.
- **Color-Coded Polygons**:
  - `Blue`: Default matched parcels.
  - `Gold / Amber`: Selected parcel.
  - `Emerald Green`: Entire holding parcels (multi-parcel khata).
  - `Dashed Slate`: Unmatched test parcels.
- **Parcel Details Card**: Shows Survey No, Land Use, Primary Owner, Official Area, Spatial Area (`Not calculated`), and Duplicate/Verification badges.
- **Bi-Directional Deep Linking**:
  - Click **"भू-नक्शा पर देखें"** on `/records/:id` $\rightarrow$ Opens `/gis` with holding highlighted.
  - Click **"अधिकार अभिलेख खोलें"** on `/gis` $\rightarrow$ Opens `/records/:id`.

---

## 4. Technical Issues & Resolutions

### `[WinError 10055]` (Windows Ephemeral Socket Exhaustion)
- **Symptom**: `OSError: [WinError 10055] An operation on a socket could not be performed because the system lacked sufficient buffer space or because a queue was full`.
- **Cause**: Uvicorn ran with `--reload` for over 15 hours. Across dozens of code changes and worker reloads (`Process SpawnProcess-11`), lingering child processes leaked socket handles in `TIME_WAIT`.
- **Fix**: Stale python processes were killed via PowerShell (`Stop-Process`), freeing port 8000. Uvicorn was restarted fresh (`uvicorn app.main:app --reload`).
- **Current Status**: Backend is responsive and healthy (`/api/ping` returns 200 in <15ms).

---

## 5. Current System Status

| Component | Status | URL / Port | Notes |
| :--- | :--- | :--- | :--- |
| **Backend API** | 🟢 Running | `http://127.0.0.1:8000` | FastAPI (PID active, 0 socket issues) |
| **Frontend UI** | 🟢 Running | `http://localhost:5173` | Vite Dev Server |
| **Database** | 🟢 Connected | `localhost:3306` (`land_record_db`) | Verified via `/api/ping` |
| **Cadastral Map** | 🟢 Live | `http://localhost:5173/gis` | 11 parcels, interactive holding view |
| **Build State** | 🟢 Clean | `npm run build` code 0 | Zero TypeScript/React errors |

---

## 6. Prompt to Paste When Starting a New Chat

When you begin a new chat session, you can simply paste the following instruction:

```text
I am continuing work on the IDVRS (Intelligent Document Verification and Registry System) project.
Please read and adhere strictly to "summary.md" at the project root for full context, constraints, and architecture.

Key rules to remember:
1. Do NOT seed or inject dummy data into MySQL; real documents will be used for demo.
2. Maintain the 5-part matching key: (state, district, tehsil, village, survey_no).
3. Keep khata_id (DB primary key) and khata_number (revenue string) strictly separate.
4. Display recorded area from MySQL; spatial geometry area must remain "Not calculated".
5. Do not misrepresent synthetic demo GeoJSON polygons as authoritative government boundaries.
6. The backend runs on http://127.0.0.1:8000 and frontend on http://localhost:5173.
```

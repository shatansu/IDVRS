# IDVRS: Intelligent Land Record Digitization & Validation System
### Problem Statement: SIH 26018 | Ministry of Rural Development (DoLR), Government of India
### Digital India Land Records Modernization Programme (DILRMP) Compliant

---

## 📌 1. What is IDVRS? (Overview for Everyone)

**IDVRS** is an AI-powered, sovereign, and offline-first land record digitization and validation system. 

In India, millions of land ownership records—such as **खतौनी / जमाबंदी (Khatoni / Form-7)** and **भू-अधिकार पुस्तिका (Bhu-Adhikar Pustika / Form-4)**—exist as legacy physical paperwork, scanned photocopies, or certified digital PDFs from state revenue portals (e.g., MP Bhulekh). Manually typing these records into central land databases is slow, expensive, and leads to clerical errors and property disputes.

**IDVRS solves this completely:**
1. **Upload**: You upload any land record document (PDF file or camera/scanner photo).
2. **Extract**: The system automatically reads the Hindi/Devanagari text and extracts all critical fields (Khata number, CLRM ID, Village, Tehsil, District, Owners, Land Use, Survey/Khasra numbers, and Area in Hectares).
3. **Validate**: A built-in mathematical and legal validation engine checks for duplicate registrations, verifies if fractional shares add up to 100%, and flags missing fields.
4. **Review & Certify**: An official **Human-in-the-Loop (HITL)** split-pane console allows a revenue officer or citizen to review the document side-by-side, make corrections with live confidence badges, and save directly to MySQL.
5. **Certified Registry**: Generates a certified **प्रारूप अधिकार अभिलेख (Record of Rights)** certificate ready for official printing (`Ctrl + P`) and updates a central executive dashboard.

> 🔒 **100% On-Premise & Data Sovereign**: Unlike systems relying on external US-based cloud APIs (like OpenAI or Gemini), IDVRS runs **entirely offline on your computer/server**. Citizen land ownership data **never leaves the machine**.

---

## ✨ 2. Key Features

- **Dual-Engine Text Extraction**:
  - *Direct Digital Extraction*: Uses `PyMuPDF` and `pdfplumber` to extract 100% accurate text from portal-generated PDFs in under 50 milliseconds without OCR noise.
  - *Scanned Document OCR*: Uses `OpenCV` image preprocessing (grayscale, Otsu thresholding, noise removal) and `Tesseract OCR` (trained on Hindi Devanagari + English) for legacy scans and camera photos.
- **Devanagari Ligature & Unicode Normalization**:
  - Automatically resolves Unicode NFC issues, zero-width characters, and font-rendering bugs common in state revenue PDFs (such as duplicated matras like `पन्नाा` $\rightarrow$ `पन्ना`).
- **Rule-Based & Symbolic Information Extraction (Zero Hallucination)**:
  - Uses high-precision lexical parsing and regular expressions instead of generic generative LLMs. This guarantees **zero hallucination** of land areas, survey numbers, or citizen names.
- **Mathematical & Integrity Validation Engine**:
  - **Duplicate Check**: Instantly detects if the same Khata number or CLRM ID has already been registered in the database.
  - **Co-owner Share Balance**: Verifies whether fractions (e.g. $1/2 + 1/4 + 1/4 = 1/1$) sum up correctly.
  - **Format Auditing**: Validates that Hectares, Revenue, and Unique IDs follow official revenue patterns.
- **Human-in-the-Loop (HITL) Review Console**:
  - Side-by-side view with zoom in/out, 90° rotate, and fullscreen document inspector.
  - Interactive tables to add/edit/delete co-owners and land parcels.
  - Unsaved change indicator and `Ctrl + S` / `Cmd + S` keyboard shortcut for fast officer workflows.
- **Official GovTech UI / DILRMP Aesthetic**:
  - Built to look and feel like an official National Government Portal (Sovereign Navy `#0c162c`, Tiranga emblem ribbon, high-contrast tables, clean status pills).
- **Certified Record of Rights (RoR) Certificate**:
  - Formatted according to official state revenue formats with stamp seals, auto-calculated percentage shares, and print optimization.
- **Central Registry & Data Management**:
  - Search by village, district, or status (Verified, Pending, Duplicate).
  - 1-click **CSV Export** for official records.
  - Individual test record deletion (🗑️) and safety-guarded clean slate reset for live hackathon demos.

---

## 🏗️ 3. System Architecture

```text
               ┌────────────────────────────────────────────────────────┐
               │         National Government Portal UI (React 19)        │
               │   • Dashboard  • Upload Console  • Review & Certify    │
               └───────────────────────────┬────────────────────────────┘
                                           │ REST API (JSON / HTTP)
                                           ▼
               ┌────────────────────────────────────────────────────────┐
               │             Backend Engine (Python / FastAPI)          │
               └───────────────────────────┬────────────────────────────┘
                                           │
         ┌─────────────────────────────────┴─────────────────────────────────┐
         ▼                                                                   ▼
┌─────────────────────────────────┐                       ┌─────────────────────────────────┐
│     Tier 1: Digital PDF Layer   │                       │      Tier 2: Scanned OCR Layer  │
│  (PyMuPDF & pdfplumber)         │                       │  (OpenCV + Tesseract hin+eng)   │
└────────────────┬────────────────┘                       └────────────────┬────────────────┘
                 │                                                         │
                 └─────────────────────────┬───────────────────────────────┘
                                           ▼
               ┌────────────────────────────────────────────────────────┐
               │    Devanagari Normalization (NFC + Matra Deduplication) │
               └───────────────────────────┬────────────────────────────┘
                                           ▼
               ┌────────────────────────────────────────────────────────┐
               │       Symbolic Information Extraction & NER Engine     │
               │    (Khata Details, Owners, Survey Parcels, Hectares)   │
               └───────────────────────────┬────────────────────────────┘
                                           ▼
               ┌────────────────────────────────────────────────────────┐
               │       Validation Engine (Duplicates, Share Fractions)  │
               └───────────────────────────┬────────────────────────────┘
                                           ▼
               ┌────────────────────────────────────────────────────────┐
               │     Relational Storage (MySQL: Khatas, Owners, Parcels)│
               └────────────────────────────────────────────────────────┘
```

---

## 💻 4. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 19, Vite 8, React Router 7 | High-performance, reactive user interface |
| **Icons & Charts** | Lucide React, Recharts | Official GovTech visual styling and interactive KPI charts |
| **Backend API** | Python 3.11, FastAPI, Uvicorn | Asynchronous, auto-documented REST endpoints |
| **Database** | MySQL 8.0, SQLAlchemy, PyMySQL | Relational schema with foreign keys and cascading deletes |
| **PDF Extraction** | PyMuPDF (fitz), pdfplumber | Blazing fast text extraction from native digital PDFs |
| **Image & OCR** | OpenCV (headless), Tesseract OCR | Image cleaning, binarization, and Hindi/English OCR |
| **Validation** | Pydantic v2, Python standard library | Strict data typing, schema validation, cross-field integrity |

---

## 📋 5. Prerequisites (Before You Begin)

Make sure you have the following installed on your machine:

1. **Python** (Version 3.10, 3.11, or 3.12)  
   👉 [Download Python](https://www.python.org/downloads/) *(Check "Add Python to PATH" during installation)*.
2. **Node.js** (Version 18, 20, or newer)  
   👉 [Download Node.js](https://nodejs.org/).
3. **MySQL Server** (Version 8.0+) or XAMPP / WampServer  
   👉 [Download MySQL Community Server](https://dev.mysql.com/downloads/mysql/).
4. **Tesseract OCR** *(Only needed if you plan to scan camera images or low-quality scanned photocopies)*:  
   👉 [Download Tesseract for Windows](https://github.com/UB-Mannheim/tesseract/wiki).  
   *Make sure to check the checkbox for "Hindi" (Script/Language) during installation.*

---

## 🚀 6. Step-by-Step Installation & Setup (Beginner Friendly)

### Step 1: Open the Project Directory
Open your terminal (PowerShell or Command Prompt) and navigate to the project directory:
```powershell
cd d:\SIH-Prototype_IDVRS
```

---

### Step 2: Set Up the MySQL Database

1. Open your MySQL client (MySQL Workbench, phpMyAdmin, or MySQL Command Line).
2. Log in with your MySQL root password.
3. Run the following single command to create the database:
```sql
CREATE DATABASE IF NOT EXISTS land_record_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```
*(You do not need to create tables manually! When the backend starts, SQLAlchemy will automatically create all tables: `documents`, `khatas`, `khata_owners`, and `khata_parcels`.)*

---

### Step 3: Configure the Backend

1. Navigate to the `Backend` directory:
   ```powershell
   cd Backend
   ```

2. Create a Python Virtual Environment:
   ```powershell
   python -m venv .venv
   ```

3. Activate the Virtual Environment:
   - On **Windows (PowerShell)**:
     ```powershell
     .\.venv\Scripts\Activate.ps1
     ```
     *(If PowerShell gives an execution policy error, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` and then run the command again).*
   - On **Linux / macOS**:
     ```bash
     source .venv/bin/activate
     ```

4. Install the required Python packages:
   ```powershell
   pip install -r requirements.txt
   ```

5. Configure your `.env` file:
   Look at the `.env` file inside `Backend/`. Open it in any text editor (like Notepad or VS Code) and verify your MySQL password:
   ```ini
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_actual_mysql_password
   DB_NAME=land_record_db
   API_HOST=127.0.0.1
   API_PORT=8000
   CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
   ```
   *(Replace `your_actual_mysql_password` with your real MySQL password, e.g., `root` or `shatansu11`).*

6. Start the Backend Server:
   ```powershell
   uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```
   You should see:
   ```text
   INFO:     Application startup complete.
   INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
   ```
   🎉 **Backend is now live!** You can visit [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) in your browser to explore the interactive Swagger API documentation.

---

### Step 4: Configure the Frontend

1. Open a **second terminal window** and navigate to the `Frontend` folder:
   ```powershell
   cd d:\SIH-Prototype_IDVRS\Frontend
   ```

2. Install the JavaScript dependencies:
   ```powershell
   npm install
   ```

3. Start the Frontend Development Server:
   ```powershell
   npm run dev
   ```
   You should see:
   ```text
     VITE v8.2.2  ready in 250 ms

     ➜  Local:   http://localhost:5173/
     ➜  Network: use --host to expose
   ```

---

### Step 5: Open the Application in your Browser
Open Google Chrome or any modern browser and visit:
👉 **[http://localhost:5173](http://localhost:5173)**

You will be greeted by the National Land Record Portal interface, showing real-time connectivity to the backend engine and MySQL database!

---

## 🎯 7. How to Use the System (Live Demo Walkthrough)

### 1. The Executive Dashboard (`/`)
- Displays real-time KPIs: Total Digitized Records, Total Land Parcels (Khasras), Registered Land Owners, and Average Extraction Confidence.
- Interactive **District-wise Distribution Bar Chart** and **Audit Status Donut Chart** powered by live MySQL data.

### 2. Uploading a Document (`/upload`)
- Click **"नया दस्तावेज़ डिजिटाइज़ (Digitize)"** in the top navigation bar.
- **Method A - Use Demo Presets**: If you want a quick 1-click test, click either **"नमूना 1: भू-अधिकार पुस्तिका (Form-4)"** or **"नमूना 2: खतौनी B1 (Form-7)"**.
- **Method B - Upload Your Own Document**: Drag-and-drop any PDF file or image (`.pdf`, `.png`, `.jpg`, `.jpeg`, `.bmp`, `.webp`) of a land record.
- Click **"दस्तावेज़ डिजिटाइज़ एवं सत्यापित करें (Digitize & Validate)"**.

### 3. Review & Verification Console (`/review`)
- The system automatically redirects to the split-pane review workspace:
  - **Left Pane**: Interactive Document Inspector. Zoom in/out, rotate 90°, or open full-screen to read the original document.
  - **Right Pane**: Extracted fields organized into:
    - **Khata General Details**: Khata number, CLRM ID, Village, Tehsil, District, Fasli Year.
    - **Co-Owners Table (सह-खातेदार)**: Owner name, Parent/Spouse name, Address, Ownership Status, and Share Fraction (e.g. `1/1`, `1/2`). Click **`+ सह-खातेदार जोड़ें`** to add more owners or click the red trash icon to delete.
    - **Land Parcels Table (खसरा भू-खण्ड)**: Survey number, Area in Hectares, Land use, and Revenue. Click **`+ नया खसरा जोड़ें`** to add parcels.
- If you edit any field, an **"⚠️ असुरक्षित संपादन (Unsaved)"** tag appears.
- Press **`Ctrl + S`** on your keyboard (or click **"डेटाबेस में सहेजें (Save Record)"**) to commit the record to MySQL.

### 4. Certified Record of Rights (RoR Certificate) (`/records/:id`)
- After saving, the system displays the official **प्रारूप अधिकार अभिलेख** certificate.
- Shows Government of India seal watermark, owner details with auto-converted percentage shares (e.g., $1/2 \rightarrow 50.00\%$), parcel inventory, and digital verification seal.
- Click **"मुद्रित करें (Print RoR)"** to open the print dialog formatted for A4 official records (`@media print`).

### 5. Land Records Registry (`/records`)
- Central database table displaying all saved records.
- Filter by status tabs: **All (सभी)**, **Verified (सत्यापित)**, **Pending (समीक्षाधीन)**, or **Duplicate (दोहराव)**.
- Search instantly by village or district name.
- Click **"CSV निर्यात करें (Export)"** to download an Excel-compatible spreadsheet of all records.
- Click the trash icon (**🗑️**) next to any row to delete that specific test record.
- Click **"डेटा रीसेट (Reset)"** to purge all test data if you want a 100% clean database before your final presentation.

---

## 📂 8. Project Structure Explained

```text
SIH-Prototype_IDVRS/
│
├── Backend/                            # Python FastAPI Backend
│   ├── app/
│   │   ├── api/                        # REST API Route Handlers
│   │   │   ├── dashboard.py            # KPI metrics, analytics, status update
│   │   │   ├── records.py              # Save record, delete record, reset database
│   │   │   └── upload.py               # Document upload, detection, pipeline runner
│   │   ├── pipeline/                   # Core OCR & Extraction Logic
│   │   │   ├── detector.py             # Distinguishes native PDFs from scanned files
│   │   │   ├── extractor.py            # PyMuPDF digital parser & Tesseract OCR runner
│   │   │   ├── field_extractor.py      # Devanagari text normalization & regex parsing
│   │   │   ├── preprocessor.py         # OpenCV image enhancement (grayscale, threshold)
│   │   │   └── validator.py            # Integrity rules (duplicates, share fractions)
│   │   ├── config.py                   # Pydantic Settings & MySQL connection builder
│   │   ├── database.py                 # SQLAlchemy engine, session maker, DB ping
│   │   ├── main.py                     # FastAPI application factory & CORS setup
│   │   └── models.py                   # SQLAlchemy Database Schema (Khatas, Owners, Parcels)
│   ├── sample_docs/                    # Test documents & extracted text logs
│   ├── uploads/                        # Temporary uploaded files storage
│   ├── .env                            # Active environment variables (DB password, ports)
│   ├── .env.example                    # Sample configuration template
│   └── requirements.txt                # Python dependencies list
│
├── Frontend/                           # React 19 Frontend
│   ├── public/samples/                 # Bundled sample PDFs for 1-click demo testing
│   ├── src/
│   │   ├── components/
│   │   │   └── ConfidenceBadge.jsx     # Visual color-coded AI confidence badge
│   │   ├── pages/
│   │   │   ├── DashboardPage.jsx       # Executive analytics & charts
│   │   │   ├── RecordDetailPage.jsx    # Certified RoR certificate view (printable)
│   │   │   ├── RecordsPage.jsx         # Registry table, search, CSV export, delete
│   │   │   ├── ReviewPage.jsx          # Split-pane HITL editor with zoom & rotate
│   │   │   └── UploadPage.jsx          # Drag-and-drop upload & preset launcher
│   │   ├── App.jsx                     # Top government banner, navigation, routes
│   │   ├── index.css                   # National GovTech design tokens & print styles
│   │   └── main.jsx                    # React entry point
│   ├── package.json                    # Node dependencies list
│   └── vite.config.js                  # Vite configuration & proxy
│
├── PRD_Land_Record_Digitization_Prototype.md # Detailed engineering product requirements
└── README.md                           # This complete documentation guide
```

---

## ❓ 9. Troubleshooting & Frequently Asked Questions (FAQ)

### Q1: When I start the backend, it says `Access denied for user 'root'@'localhost'`
- **Fix**: Your MySQL password in `Backend/.env` does not match your MySQL server password. Open `Backend/.env` and update `DB_PASSWORD=your_mysql_password` to match what you use when logging into MySQL Workbench.

### Q2: It says `Unknown database 'land_record_db'`
- **Fix**: Open your MySQL terminal or Workbench and run:
  ```sql
  CREATE DATABASE land_record_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  ```

### Q3: Tesseract OCR says `tesseract is not recognized as an internal or external command`
- **Fix**: If you installed Tesseract in a non-standard directory, either add `C:\Program Files\Tesseract-OCR` to your Windows System `PATH`, or ensure it is installed in `C:\Program Files\Tesseract-OCR\tesseract.exe`. For native digital PDFs (like official MP Bhulekh copies), Tesseract is not even needed because IDVRS extracts text directly from the PDF layer!

### Q4: Port 8000 or 5173 is already in use
- **Fix**: If port 8000 is taken, you can run uvicorn on another port:
  ```powershell
  uvicorn app.main:app --host 127.0.0.1 --port 8001
  ```
  And update the proxy in `Frontend/vite.config.js` or `.env`.

### Q5: Can this be extended to other Indian languages (Marathi, Gujarati, Tamil)?
- **Answer**: Yes! The extraction engine (`Backend/app/pipeline/field_extractor.py`) is completely decoupled from the rest of the application. In the future, this layer can be linked with **AI4Bharat IndicBERT / Bhashini** (Government of India open-source NLP model) to parse records across all 22 official Indian languages without changing the frontend or database schemas.

---

## 🏆 10. Hackathon Presentation & Pitch Tips

When presenting IDVRS to judges:
1. **Highlight Data Sovereignty**: Mention that land records are national security and citizen-privacy critical. IDVRS does not send sensitive ownership data to external foreign cloud APIs.
2. **Emphasize Zero Hallucination**: Emphasize that generative LLMs often hallucinate numbers (e.g. changing 0.340 ha to 3.40 ha). Our rule-based information extraction guarantees 100% mathematical fidelity.
3. **Showcase the HITL Console**: Highlight that no OCR in the world is 100% perfect on 50-year-old degraded paper. The Human-in-the-Loop review console with live confidence scores is the exact practical tool government revenue officers need to achieve 100% clean registries.

---

## 📜 11. License & Acknowledgments
Built for **Smart India Hackathon (SIH 26018)** under the guidelines of the **Ministry of Rural Development (Department of Land Resources - DoLR)** and the **Digital India Land Records Modernization Programme (DILRMP)**.

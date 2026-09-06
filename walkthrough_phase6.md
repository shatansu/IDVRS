# Phase 6 Walkthrough: Records List + Dashboard

## What Was Built

### Backend — 3 New Endpoints (`Backend/app/api/dashboard.py`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/records` | GET | List all khatas with owner/parcel counts. Filterable by `?village=` and `?district=` |
| `/api/records/{id}` | GET | Full detail: khata fields + all owners + all parcels |
| `/api/records/{id}/status` | PATCH | Toggle `review_status` between `verified` / `pending_review` |
| `/api/dashboard/stats` | GET | Aggregate stats: total docs, avg confidence, pending count, duplicate count, district breakdown, status breakdown |

### Frontend — 3 New Pages

| File | Route | Description |
|---|---|---|
| `RecordsPage.jsx` | `/records` | Searchable table of all saved khatas |
| `RecordDetailPage.jsx` | `/records/:id` | Full khata detail — metadata + owners table + parcels table + verify button |
| `DashboardPage.jsx` | `/dashboard` | 6 stat cards + Recharts Bar + Pie chart |

Nav bar updated with **Records** and **Dashboard** links (Review link replaced — it's accessed via Upload flow).

---

## Browser Test Results — Real Data (Khata #3 and #4)

### Records List Page (`/records`)

![Records List Page](C:/Users/ASUS/.gemini/antigravity-ide/brain/988a1c7a-1ec0-4f17-a754-08bd28e54757/records_list.png)

- **2 rows** displayed from DB
- **Record #3**: Khata 2305 · सिमरिया · पन्नाा · 9 Owners · 8 Parcels · `Pending`
- **Record #4**: Khata 2305 · सिमरिया · पन्ना · 9 Owners · 8 Parcels · `Duplicate` badge
- Hindi Devanagari text renders correctly in the browser
- Row click navigates to detail page

### Record Detail Page (`/records/3`)

![Record Detail Page](C:/Users/ASUS/.gemini/antigravity-ide/brain/988a1c7a-1ec0-4f17-a754-08bd28e54757/record_detail.png)

- Full metadata shown: CLRM No, Khata Number, Village, Tehsil, District, State, Fasli Year, Patwari Halka, Source filename
- All **9 owners** rendered with share fractions (1/3, 1/15, 1/9), status (भूमि स्वामी)
- All **8 parcels** with survey numbers (96/1 (S) → 113/1 (S)), area in ha, revenue in ₹

### Verify Action + Toast

![Verified Toast](C:/Users/ASUS/.gemini/antigravity-ide/brain/988a1c7a-1ec0-4f17-a754-08bd28e54757/record_verified.png)

- Clicking **Mark Verified** calls `PATCH /api/records/3/status`
- Status badge instantly flips to green **Verified**
- Success toast: *"Marked as Verified"*

### Dashboard Page (`/dashboard`)

![Dashboard Page](C:/Users/ASUS/.gemini/antigravity-ide/brain/988a1c7a-1ec0-4f17-a754-08bd28e54757/dashboard.png)

| Stat Card | Value |
|---|---|
| Documents Processed | 21 |
| Saved Khata Records | 2 |
| Avg. Confidence | 94% |
| Pending Review | 1 |
| Duplicate Flags | 1 |
| Verified Records | 1 |

- **Bar Chart (Records by District)**: Shows 2 bars — पन्नाा (1 record) and पन्ना (1 record)
- **Pie/Donut Chart (Review Status)**: 50% Verified (green), 50% Pending Review (amber) — updated live after verify action

---

## How to Test Manually

1. **Start backend** (if not running):
   ```powershell
   cd d:\SIH-Prototype_IDVRS\Backend
   .\.venv-phase3\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000
   ```

2. **Start frontend**:
   ```powershell
   cd d:\SIH-Prototype_IDVRS\Frontend
   npm run dev
   ```

3. Open **http://localhost:5173/records** → See the records table
4. Click any row → Record detail page with owners + parcels
5. Click **Mark Verified** → Status updates instantly, toast appears
6. Click **Dashboard** in nav → See stat cards + charts

### Test Search/Filter:
- Type `सिमरिया` in village filter box → Should show both records
- Type `पन्ना` in district filter → Should show both (partial match)
- Type something else → Shows "No records match"

### Test API directly:
```
GET  http://127.0.0.1:8000/api/records
GET  http://127.0.0.1:8000/api/records/3
GET  http://127.0.0.1:8000/api/records/4
GET  http://127.0.0.1:8000/api/dashboard/stats
PATCH http://127.0.0.1:8000/api/records/3/status  body: {"review_status":"verified"}
```

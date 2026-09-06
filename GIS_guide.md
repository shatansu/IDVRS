# IDVRS — GIS / Cadastral Map Engine
## Feature PRD + Technical Implementation Guide

Version: GIS-1
Status: Implementation Specification
Project: IDVRS — Intelligent Land Record Digitization & Validation System

---

# 1. PURPOSE

This document is the complete Product Requirement Document (PRD),
architecture specification, technical implementation guide, and
acceptance criteria for adding a GIS / Cadastral Map Engine to the
existing IDVRS prototype.

The implementation agent must read and understand this entire document
before modifying the codebase.

The GIS feature must be added on top of the existing IDVRS system.

The existing document digitization workflow must continue working:

Document Upload
    ↓
Source Detection
    ↓
PDF Text Extraction / OCR
    ↓
Field Extraction
    ↓
Validation
    ↓
Human Review
    ↓
MySQL Persistence
    ↓
Land Record Registry

The GIS module is an additional capability:

Land Records
    +
Spatial Parcel Geometry
    ↓
GIS API
    ↓
Interactive Cadastral Map
    ↓
Parcel ↔ Khata ↔ Record Integration


# 2. PRIMARY OBJECTIVE

Build a functional GIS/Cadastral Map Engine that allows an authorized
user to visually inspect land parcels and connect spatial parcel
information with the structured land-record information already stored
in IDVRS.

The user should be able to:

1. Open a GIS map.
2. View cadastral parcel polygons.
3. Search for a survey/khasra number.
4. Filter by administrative hierarchy.
5. Click a parcel.
6. See its spatial and land-record information.
7. Open the corresponding Khata/Record.
8. Open the GIS map from an existing Record Detail page.
9. Highlight all parcels belonging to a Khata.
10. Understand whether displayed geometry is demo/prototype data or
    authoritative cadastral data.


# 3. IMPORTANT DOMAIN PRINCIPLE

A land record and a cadastral geometry are NOT the same thing.

The existing IDVRS land-record database contains textual/structured
information such as:

- Khata number
- Owner
- Survey / Khasra number
- Area
- Land use
- Revenue
- Village
- Tehsil
- District
- State

These attributes alone do NOT determine the actual geographic shape
of a parcel.

Therefore:

survey_number + village + area

must NOT be treated as sufficient information for creating an
authoritative cadastral polygon.

A real cadastral polygon must come from a spatial/cadastral dataset,
survey data, digitized map, government GIS service, or another
authoritative spatial source.

For GIS-1, a prototype spatial dataset may be used to demonstrate the
complete workflow.

Prototype geometry MUST be explicitly marked:

    DEMO / PROTOTYPE GEOMETRY
    NOT AN AUTHORITATIVE GOVERNMENT CADASTRAL BOUNDARY

The system must never imply that synthetic prototype polygons are
official land boundaries.


# 4. CURRENT IDVRS ARCHITECTURE

The existing backend is FastAPI.

The existing database is MySQL accessed through SQLAlchemy.

Important existing entities include:

Document
    ↓
Khata
    ├── KhataOwner
    └── KhataParcel

KhataParcel currently stores textual parcel information such as:

- survey number
- parcel identifier
- land use
- area
- revenue

The current KhataParcel model does NOT contain spatial geometry.

Therefore, GIS geometry must initially remain in a separate spatial
layer.

Do NOT migrate the existing MySQL architecture to PostGIS in GIS-1.

Do NOT rewrite the existing database schema unnecessarily.


# 5. CURRENT REPOSITORY AREAS TO INSPECT

Before implementation, inspect the existing project.

Important files/directories include:

Backend/
    app/
        main.py
        models.py
        database.py
        api/
            upload.py
            records.py
            dashboard.py
        pipeline/
            detector.py
            extractor.py
            field_extractor.py
            validator.py

Frontend/
    src/
        App.jsx
        components/
        pages/
            DashboardPage.jsx
            RecordDetailPage.jsx
            RecordsPage.jsx
            ReviewPage.jsx
            UploadPage.jsx

The implementation agent must understand the current architecture before
editing files.

Do NOT blindly replace existing components.

Prefer additive architecture.


# 6. DESIGN PRINCIPLE

Use this architecture for GIS-1:

                IDVRS
                  |
        +---------+---------+
        |                   |
        v                   v
      MySQL            Spatial Dataset
   Land Records          GeoJSON
        |                   |
        |                   |
        +---------+---------+
                  |
                  v
               GIS API
                  |
                  v
          React GIS Interface
                  |
                  v
          Leaflet / React-Leaflet

MySQL remains responsible for relational land-record information.

The spatial dataset remains responsible for parcel geometry.

The GIS API joins these two worlds.


# 7. WHY A SEPARATE SPATIAL LAYER IS REQUIRED

Existing MySQL records are semantic/administrative data.

Example:

Khata
    KHATA_NO = 2305

KhataParcel
    SURVEY_NO = 101
    AREA = 0.7200 hectare

This tells us WHICH parcel is being referenced.

It does not tell us WHERE the polygon is located.

A spatial layer can contain:

parcel_id
survey_no
village
tehsil
district
state
geometry

The GIS integration layer matches these records.

Example:

MySQL:

    survey_no = 101
    village = Simariya
    tehsil = Panna
    district = Panna

Spatial dataset:

    survey_no = 101
    village = Simariya
    tehsil = Panna
    district = Panna
    geometry = Polygon(...)

The GIS service can then combine them.


# 8. GIS-1 SCOPE

GIS-1 is a WORKING PROTOTYPE GIS ENGINE.

IN SCOPE:

- Interactive map
- Cadastral polygons
- GeoJSON support
- Parcel selection
- Parcel highlighting
- Parcel search
- Administrative filters
- Khata filtering
- Record ↔ Map linking
- Entire holding visualization
- Map legend
- Layer controls where appropriate
- Parcel information panel
- Prototype geometry metadata
- API-based parcel retrieval
- Responsive UI
- Error/loading states
- End-to-end testing

OUT OF SCOPE FOR GIS-1:

- Production cadastral digitization
- Editing authoritative cadastral boundaries
- Mutation workflow
- Real government master GIS database
- State LRMS integration
- DILRMP production integration
- Bhu-Naksha production integration
- ULPIN generation
- Survey instrument integration
- Drone/GNSS processing
- Advanced spatial analysis
- Parcel splitting/merging
- Production authentication/RBAC
- Full PostGIS migration
- Full GeoServer deployment
- Automatic georeferencing of scanned cadastral maps


# 9. USER PERSONA

Primary prototype user:

Revenue / land-record official or reviewer.

The user should be able to go from textual land records to a visual
understanding of the parcel.

Example:

Official opens Record #123
    ↓
Sees Khata details
    ↓
Clicks "View on Map"
    ↓
GIS page opens
    ↓
Relevant parcel is automatically selected
    ↓
Map zooms to parcel
    ↓
Parcel information appears
    ↓
Other parcels in the same Khata can be highlighted


# 10. TARGET USER FLOW

## FLOW A — OPEN GIS

User
    ↓
GIS page
    ↓
Map loads
    ↓
Available parcel geometry displayed
    ↓
Legend displayed


## FLOW B — SEARCH PARCEL

User enters:

Survey No. = 101

    ↓

GIS API searches spatial records
    ↓
Matching parcel found
    ↓
Map zooms to parcel
    ↓
Parcel is highlighted
    ↓
Information panel opens


## FLOW C — RECORD TO GIS

User opens:

/records/:id

    ↓

Clicks:

View on Map

    ↓

/gis?recordId=:id

    ↓

GIS page loads record context
    ↓
Finds corresponding parcel(s)
    ↓
Zooms to them
    ↓
Highlights them


## FLOW D — GIS TO RECORD

User clicks parcel

    ↓

Parcel information appears

    ↓

Open Land Record

    ↓

/records/:id

The record page opens.


## FLOW E — ENTIRE HOLDING

One Khata may contain multiple parcels.

Example:

Khata 2305

    ├── Survey 101
    ├── Survey 102
    ├── Survey 103
    └── Survey 104

When the user selects:

    View Entire Holding

the map should highlight all spatial parcels associated with the
selected Khata.


# 11. FRONTEND GIS PAGE

Create a dedicated page:

    Frontend/src/pages/GISPage.jsx

Route:

    /gis

Suggested UI:

+--------------------------------------------------------------+
| GIS / Cadastral Map                                          |
|--------------------------------------------------------------|
| State | District | Tehsil | Village | Khata | Survey No.    |
|--------------------------------------------------------------|
| Search [____________________] [Find Parcel]                  |
|--------------------------------------------------------------|
|                                                              |
|                     MAP                                      |
|                                                              |
|              cadastral polygons                              |
|                                                              |
|      +--------------------------+                            |
|      | Selected Parcel          |                            |
|      | Survey No: 101           |                            |
|      | Khata: 2305              |                            |
|      | Area: 0.72 ha            |                            |
|      | Land Use: Agriculture    |                            |
|      | [Open Record]            |                            |
|      +--------------------------+                            |
|                                                              |
+--------------------------------------------------------------+

The exact visual design should match the existing IDVRS GovTech UI.

Do not introduce a completely unrelated visual language.


# 12. MAP TECHNOLOGY

Use:

- Leaflet
- React-Leaflet

unless the existing project already contains a compatible mapping
library.

Do not introduce multiple mapping libraries for the same purpose.

The mapping library must support:

- polygon rendering
- click events
- zoomToBounds
- layer highlighting
- map movement
- GeoJSON rendering
- popups or custom information panels


# 13. FRONTEND DEPENDENCIES

Add the minimum required dependencies.

Expected:

    leaflet
    react-leaflet

Do not install large unnecessary GIS frameworks.

Do not introduce unnecessary state-management libraries.

Use the existing React architecture unless there is a strong reason
to add something new.


# 14. LEAFLET CSS

Leaflet CSS must be loaded correctly.

The implementation must verify:

- map tiles or map background render
- marker/polygon interaction works
- controls render correctly
- map has a valid height

A common failure is:

    map container exists
    but height = 0

Make sure the map container has an explicit usable height.

Example concept:

    .gis-map-container {
        height: 650px;
        width: 100%;
    }

Use responsive sizing where appropriate.


# 15. MAP BASE LAYER

GIS-1 should use a standard basemap appropriate for a prototype.

The base layer must not be represented as an authoritative cadastral
source.

The cadastral parcel polygons are the important spatial data layer.

Avoid excessive dependency on external map services.

Keep the architecture such that a future offline/sovereign basemap can
replace the current prototype basemap.


# 16. SPATIAL DATA FORMAT

For GIS-1 use GeoJSON.

Expected root:

    FeatureCollection

Each parcel should generally be:

    Feature

with:

    geometry

and:

    properties

Example structure:

{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "SIM-P101",
      "properties": {
        "parcel_id": "SIM-P101",
        "survey_no": "101",
        "village": "Simariya",
        "tehsil": "Panna",
        "district": "Panna",
        "state": "Madhya Pradesh",
        "geometry_status": "DEMO",
        "source_type": "prototype",
        "authoritative": false
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [...]
        ]
      }
    }
  ]
}


# 17. GEOMETRY RULES

Geometry may initially be:

- Polygon
- MultiPolygon

Do not assume every cadastral dataset will always contain Polygon.

The architecture should not break if a future real dataset contains
MultiPolygon.

Validate:

- geometry exists
- geometry type supported
- coordinates valid enough for rendering
- feature identifier present

Invalid geometries should not crash the entire GIS page.

The API should report malformed data appropriately.


# 18. COORDINATE REFERENCE SYSTEM

For browser rendering through standard GeoJSON:

GIS-1 should prefer WGS 84 longitude/latitude coordinates where possible.

Important:

GeoJSON coordinate order must be treated correctly.

Use:

    [longitude, latitude]

not:

    [latitude, longitude]

Do not silently swap coordinate axes.

The implementation must document the CRS of the dataset.

If a future cadastral dataset uses a projected CRS, transformation must
happen before browser consumption or through an explicitly supported
CRS workflow.

Do not hardcode a CRS conversion without knowing the source CRS.


# 19. REAL GEOMETRY VS DEMO GEOMETRY

This is mandatory.

Every spatial dataset should have metadata indicating its provenance.

Suggested properties:

    geometry_status:
        DEMO
        AUTHORITATIVE
        UNKNOWN

    source_type:
        prototype
        government
        state_lrms
        bhunaksha
        uploaded_dataset
        other

    authoritative:
        true / false

For GIS-1 demo geometry:

    geometry_status = DEMO
    source_type = prototype
    authoritative = false

The UI must show a clear indicator such as:

    Prototype GIS Data

or:

    DEMO GEOMETRY — NOT AUTHORITATIVE CADASTRAL BOUNDARY


# 20. DEMO DATA REQUIREMENT

Create a small deterministic cadastral GeoJSON dataset for testing.

The dataset must correspond to the sample land-record context already
used in the prototype where possible.

The geometry itself can be synthetic.

Synthetic geometry must NOT be described as:

- official government map
- actual parcel boundary
- verified cadastral boundary
- official Bhu-Naksha geometry

The purpose of demo geometry is to demonstrate:

    Land Record
        ↕
    Parcel Identifier
        ↕
    Spatial Polygon


# 21. DATA JOIN STRATEGY

The spatial layer must be connected to existing land records using
stable identifying attributes.

Preferred matching hierarchy:

LEVEL 1:

    official parcel identifier / ULPIN

LEVEL 2:

    parcel_id

LEVEL 3:

    state
    + district
    + tehsil
    + village
    + survey_no

LEVEL 4:

    controlled fallback matching

Do not use area alone as the identity key.

Do not use owner name alone as the identity key.

Do not use approximate geometry to infer ownership.

Do not create a false match.


# 22. CURRENT PROTOTYPE MATCHING KEY

Because GIS-1 does not yet have ULPIN or official cadastral IDs,
use:

    state
    district
    tehsil
    village
    survey_no

as the primary prototype join key.

Normalize values before matching.

Examples of normalization:

- trim whitespace
- Unicode normalization
- consistent case for Latin text
- consistent separator handling where appropriate
- preserve meaningful Hindi text
- avoid destructive transliteration

Survey numbers must not be normalized in a way that changes their
meaning.


# 23. MULTI-PARCEL KHATA

A Khata may contain many parcels.

Therefore the architecture must support:

Khata
    |
    +---- Parcel A
    |
    +---- Parcel B
    |
    +---- Parcel C

The GIS API should be able to return all spatial features associated
with a Khata.

Example:

    GET /api/gis/parcels?khata_id=123

should return all spatially matched parcels for that Khata where
appropriate.


# 24. GIS BACKEND ARCHITECTURE

Create a dedicated GIS API module.

Suggested:

    Backend/app/api/gis.py

Register it in:

    Backend/app/main.py

Do not put all GIS logic inside unrelated existing API files.

Recommended responsibilities:

gis.py:
    route handling

GIS service/helper:
    spatial dataset loading
    filtering
    matching
    enrichment
    response formatting

Keep the architecture easy to migrate to PostGIS later.


# 25. GIS API ENDPOINTS

Minimum API surface:

## GET /api/gis/parcels

Returns parcel features.

Possible filters:

    state
    district
    tehsil
    village
    khata_id
    survey_no
    parcel_id

Example:

    GET /api/gis/parcels?village=Simariya


## GET /api/gis/parcels/{parcel_id}

Returns one parcel and associated information.


## GET /api/gis/khata/{khata_id}

Returns all spatial parcels associated with a Khata.


## GET /api/gis/search

Searches spatial parcels using supported identifiers.

The exact endpoint structure may be simplified if the implementation
can keep the API cleaner.

Do not create redundant endpoints unnecessarily.


# 26. RECOMMENDED GIS RESPONSE

Return GeoJSON-compatible output.

Example:

{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "SIM-P101",
      "properties": {
        "parcel_id": "SIM-P101",
        "survey_no": "101",
        "village": "Simariya",
        "tehsil": "Panna",
        "district": "Panna",
        "state": "Madhya Pradesh",

        "khata_id": 123,
        "khata_number": "2305",

        "area_hectare": 0.72,
        "land_use": "Agriculture",

        "match_status": "MATCHED",

        "geometry_status": "DEMO",
        "authoritative": false
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [...]
      }
    }
  ]
}


# 27. MATCH STATUS

Each parcel returned by the GIS API should ideally expose:

    MATCHED
    UNMATCHED
    AMBIGUOUS

Meaning:

MATCHED:
    Spatial parcel successfully linked with a land-record parcel.

UNMATCHED:
    Geometry exists but no matching structured record was found.

AMBIGUOUS:
    More than one possible land-record match exists.

Never silently select an arbitrary record for an ambiguous match.


# 28. GIS SEARCH

Search should support at minimum:

- Survey number
- Parcel ID
- Khata number

Where practical:

- Village
- District
- Tehsil

Search should be case-insensitive for Latin text.

Hindi text should remain searchable.

Search results should not require exact typing when safe partial matching
is possible.

However, partial search must not result in incorrect record association.


# 29. ADMINISTRATIVE FILTERS

Provide filter controls:

State
District
Tehsil
Village

Filters should be hierarchical where practical.

Example:

Selecting:

District = Panna

should reduce:

Tehsil options

Selecting:

Tehsil = Panna

should reduce:

Village options

Selecting:

Village = Simariya

should reduce:

parcel results.


# 30. PARCEL CLICK BEHAVIOR

When a polygon is clicked:

1. Highlight polygon.
2. Open a popup or information panel.
3. Show:
   - Survey/Khasra number
   - Parcel ID
   - Area
   - Land use
   - Village
   - Tehsil
   - District
   - Khata number if matched
   - Match status
   - Geometry status
4. Provide:
   - Open Record
   - View Entire Holding
   where applicable.

Do not display dozens of irrelevant fields.


# 31. SELECTED PARCEL VISUAL STATE

A parcel should have clear visual states.

At minimum:

Default
Selected
Entire Holding
Unmatched
Disabled/error

Selected parcel should be visually distinguishable.

Entire holding should allow the user to understand that multiple parcels
belong to the same Khata.

Use the existing project's visual language rather than arbitrary colors
everywhere.


# 32. ENTIRE HOLDING FUNCTION

Example:

Khata 2305

contains:

Survey 101
Survey 102
Survey 103

User clicks:

    View Entire Holding

The map should:

1. Retrieve all matching parcels.
2. Highlight them.
3. Fit map bounds around them.
4. Show a summary:

    Khata: 2305
    Parcels: 3
    Total recorded area: X hectare

Do not calculate new legal ownership from geometry.

The displayed "total recorded area" must come from the land-record data
when available, not from polygon area unless explicitly labelled as
computed spatial area.


# 33. IMPORTANT AREA RULE

There are two potentially different concepts:

1. Recorded area
2. Spatial geometry area

These are not necessarily identical.

Never silently replace recorded area with polygon-computed area.

Display separately where appropriate:

    Recorded Area: 0.72 ha

    Spatial Geometry Area:
    0.70 ha

If spatial calculation is not implemented:

    Spatial Area: Not calculated

Future GIS versions may compare the two values.


# 34. RECORD DETAIL INTEGRATION

Modify:

    Frontend/src/pages/RecordDetailPage.jsx

Add:

    View on Map

button/action.

The button should navigate to something like:

    /gis?recordId=<id>

or

    /gis?khataId=<id>

Prefer stable database record IDs.

When GIS page opens from a record:

1. Fetch record if necessary.
2. Resolve associated parcel identifiers.
3. Search GIS.
4. Highlight matching polygons.
5. Zoom to bounds.


# 35. GIS → RECORD INTEGRATION

When a parcel has:

    match_status = MATCHED

provide:

    Open Land Record

This should open the correct:

    /records/:id

If parcel is unmatched, do not show a misleading record link.

Instead show:

    No linked land record found.


# 36. MAP URL STATE

The GIS page should support deep links.

Examples:

    /gis

    /gis?surveyNo=101

    /gis?khataId=123

    /gis?recordId=45

This enables:

- record-to-map navigation
- bookmarking
- demonstrations
- reproducible test cases


# 37. LAYER MODEL

At minimum:

Layer 1:
    Base Map

Layer 2:
    Cadastral Parcels

Optional:

Layer 3:
    Selected Parcel

Layer 4:
    Entire Khata Holding

Future:

Layer:
    Roads

Layer:
    Water Bodies

Layer:
    Village Boundary

Layer:
    Administrative Boundary

Layer:
    Satellite Imagery

Do not add unnecessary layers in GIS-1.


# 38. MAP CONTROLS

Useful controls:

- Zoom in/out
- Fit to selected parcel
- Reset view
- Search
- Filter
- Legend
- Layer toggle
- Full-screen if compatible

Avoid clutter.


# 39. EMPTY STATES

Handle:

No parcel found

Display:

    No matching parcel found.

No geometry:

    Land record found, but spatial geometry is not available.

No land record:

    Spatial parcel found, but no matching land record exists.

Ambiguous match:

    Multiple possible land-record matches found.
    Review required.

No GIS data:

    Spatial dataset is unavailable.


# 40. ERROR HANDLING

The GIS module must not crash because of:

- invalid GeoJSON
- empty API response
- backend unavailable
- malformed parcel
- missing geometry
- missing survey number
- unmatched record
- malformed query parameters

Show user-friendly messages.

Developer errors should be logged appropriately.


# 41. PERFORMANCE

GIS-1 is a small prototype.

Do not over-engineer.

However:

- avoid fetching the entire dataset repeatedly
- cache static GeoJSON where reasonable
- filter server-side where practical
- do not render thousands of unnecessary polygons
- debounce search input if live search is implemented

Future production architecture can use:

- PostGIS
- spatial indexes
- vector tiles
- GeoServer
- OGC APIs
- optimized tile services


# 42. STATIC VS DATABASE SPATIAL DATA

GIS-1 may use a static GeoJSON source.

Possible location:

    Backend/gis_data/

or another clearly documented spatial-data directory.

The backend should serve the data through an API instead of making the
frontend directly depend on a hardcoded file path if practical.

This keeps the frontend independent from the eventual storage mechanism.


# 43. FUTURE SPATIAL DATABASE

Do NOT implement PostGIS migration in GIS-1.

However, code should be structured so that:

Current:

    GeoJSON → GIS service → API

can later become:

    PostGIS → GIS service → API

without redesigning the frontend.

Future PostGIS model may include:

    parcel_id
    survey_no
    village
    tehsil
    district
    state
    ulpin
    geometry
    geometry_source
    geometry_version
    created_at
    updated_at

Use a proper spatial index in production.


# 44. FUTURE GEOSPATIAL SERVER

Future architecture may use:

    PostGIS
       ↓
    GeoServer
       ↓
    OGC services / APIs
       ↓
    IDVRS GIS frontend

Do not add GeoServer just for GIS-1.


# 45. OGC COMPATIBILITY

The API architecture should remain compatible with modern geospatial
web standards.

Future compatibility target:

    OGC API - Features

This means the spatial API should conceptually work with:

- feature collections
- feature identifiers
- geometry
- feature properties
- filtering
- predictable REST access

Do not claim that GIS-1 is a full OGC-conformant implementation unless
it actually conforms to the relevant standard.


# 46. REAL CADASTRAL DATA INTEGRATION — FUTURE

Future spatial data may come from:

- official state cadastral datasets
- digitized cadastral maps
- GeoJSON
- Shapefile
- GeoPackage
- government GIS services
- Bhu-Naksha-related spatial systems
- State LRMS/LRIS
- survey/GNSS workflows

The integration adapter should eventually normalize source data into
a common internal parcel representation.


# 47. DATA SOURCE ADAPTER CONCEPT

Future architecture:

                +--------------------+
                | Spatial Source     |
                +--------------------+
                   /    |    \
                  /     |     \
             GeoJSON  SHP   Government API
                  \     |     /
                   \    |    /
                    v   v   v
                 GIS Adapter
                      |
                      v
               Normalized Parcel
                      |
                      v
                   GIS API
                      |
                      v
                   Frontend


# 48. AUTHORITATIVE DATA

The application must distinguish:

    source data

from:

    derived/display data

Examples:

Official cadastral boundary:
    authoritative = true

Prototype polygon:
    authoritative = false

Never set:

    authoritative = true

for synthetic geometry.


# 49. DATA PROVENANCE

Every real spatial dataset should eventually have metadata such as:

- source
- state
- district
- tehsil
- village
- dataset version
- acquisition date
- CRS
- geometry source
- processing status
- authority
- import timestamp

GIS-1 can implement a simplified version of this.

Recommended:

    source_type
    geometry_status
    authoritative


# 50. GEOMETRY VALIDATION

Future production validation should include:

- geometry validity
- self-intersection
- duplicate polygons
- missing geometry
- invalid coordinate ranges
- CRS consistency
- parcel ID uniqueness
- survey number consistency

GIS-1 only needs basic validation required to prevent rendering
failures.


# 51. ROR / LAND RECORD RELATIONSHIP

The key conceptual relationship is:

    Record of Rights / Land Record
                  +
            Cadastral Map
                  ↓
            Unified View

The user should not see the map as a separate unrelated feature.

It should be an extension of the land record.


# 52. FUTURE ROR + MAP VIEW

Future GIS versions may provide:

+-----------------------------------+
| Parcel Map                        |
|                                   |
|          Selected Parcel          |
|                                   |
+-----------------------------------+

+-----------------------------------+
| Record of Rights                  |
|                                   |
| Khata: 2305                       |
| Owner: ...                        |
| Survey No: 101                    |
| Area: 0.72 ha                     |
|                                   |
+-----------------------------------+

This is intentionally a future enhancement.

GIS-1 only needs navigation between these views.


# 53. FUTURE MAP + CERTIFIED RECORD

A future system may generate a certified record package containing:

- land-record information
- parcel map
- survey number
- area
- metadata
- QR/reference ID
- generation timestamp

However, GIS-1 should not automatically claim that its synthetic map
is a certified cadastral map.


# 54. SECURITY

GIS data can be sensitive.

GIS-1 must not expose credentials.

Do not:

- hardcode DB credentials
- expose .env
- expose API secrets
- expose internal filesystem paths
- put sensitive credentials in GeoJSON

Future production:

- authentication
- RBAC
- authorized GIS data access
- audit logging
- source-data permission controls


# 55. OFFLINE / SOVEREIGN ARCHITECTURE

IDVRS is intended to remain suitable for controlled government
deployment.

GIS architecture should therefore avoid unnecessary mandatory
third-party cloud dependencies.

The future system should be capable of:

    Local/Private GIS server
        +
    Local database
        +
    Local spatial datasets
        +
    Internal API
        +
    Browser frontend

An external basemap should not be considered a required dependency for
the application's core land-record data.


# 56. EXISTING FUNCTIONALITY MUST NOT BREAK

This is a critical requirement.

After GIS implementation, verify that all existing workflows still
work.

Existing:

    Upload
    OCR
    Extraction
    Validation
    Review
    Save Record
    Registry
    Record Detail
    Dashboard
    Delete
    Reset

must remain functional.

Do not refactor unrelated modules simply for style.


# 57. FRONTEND ROUTING

Add:

    /gis

without breaking existing routes.

Existing routes include conceptually:

    /
    /upload
    /review
    /records
    /records/:id

The GIS route should fit naturally into the existing application.


# 58. NAVIGATION

Add a visible GIS navigation entry if the existing application layout
supports it.

Suggested label:

    GIS Map

or:

    Cadastral Map

Use terminology consistent with the rest of the product.


# 59. UI LANGUAGE

The product UI can use English as the primary technical/prototype
language.

However, the system must preserve Hindi land-record text correctly.

Do not transliterate or destroy Devanagari data merely for GIS display.


# 60. ACCESSIBILITY

GIS controls should have:

- readable labels
- keyboard focus where applicable
- useful button names
- accessible status text

Map interactions should have a non-map information alternative where
possible, such as a parcel details panel.


# 61. IMPLEMENTATION ORDER

Implement in the following sequence.

PHASE 1 — Repository analysis

1. Inspect existing frontend.
2. Inspect backend.
3. Inspect database models.
4. Understand existing record APIs.
5. Identify existing navigation/layout.
6. Identify whether any mapping dependency already exists.

Do not code yet.

PHASE 2 — Spatial data foundation

1. Create prototype GeoJSON.
2. Define parcel properties.
3. Define geometry metadata.
4. Define matching keys.
5. Validate GeoJSON.

PHASE 3 — Backend

1. Create GIS API module.
2. Load spatial data.
3. Implement filters.
4. Implement parcel lookup.
5. Implement Khata lookup.
6. Match spatial parcels to existing records.
7. Return GeoJSON-compatible responses.
8. Handle unmatched and ambiguous cases.

PHASE 4 — Frontend

1. Add Leaflet dependencies.
2. Add GIS page.
3. Render map.
4. Load API data.
5. Render polygons.
6. Add parcel selection.
7. Add search.
8. Add filters.
9. Add information panel.
10. Add open-record navigation.
11. Add entire-holding functionality.

PHASE 5 — Integration

1. Add View on Map to Record Detail.
2. Add GIS navigation.
3. Add deep-link support.
4. Verify full workflow.

PHASE 6 — Testing

Run backend.
Run frontend.
Open GIS.
Test filters.
Test parcel selection.
Test record integration.
Test existing features.


# 62. SUGGESTED FILE STRUCTURE

Possible structure:

Backend/
    app/
        api/
            gis.py

    gis_data/
        cadastral_demo.geojson

Frontend/
    src/
        pages/
            GISPage.jsx

        components/
            GISMap.jsx
            GISFilters.jsx
            ParcelInfoPanel.jsx

The exact component structure can be simplified if the existing
frontend is small.

Do not create unnecessary abstraction for a small feature.


# 63. MAP STATE

The GIS page should maintain state for:

    map data
    selected parcel
    loading
    error
    search query
    filters
    matched record
    entire holding selection

Use React state/hooks consistent with the existing project.


# 64. API LOADING STATES

Before data loads:

    Loading cadastral data...

During search:

    Searching parcel...

During record resolution:

    Resolving land record...


# 65. API ERROR STATES

Example:

    Unable to load GIS data.
    Check the backend service and try again.

Do not display raw Python exceptions to the user.


# 66. DATA MATCHING SAFETY

Never do fuzzy matching between unrelated land records and polygons
without explicit confidence logic.

For GIS-1:

Prefer exact normalized key matching.

Example:

    state
    district
    tehsil
    village
    survey_no

If no exact match:

    UNMATCHED

Do not force a match.


# 67. DUPLICATE MATCHES

If multiple land records have the same matching key:

    AMBIGUOUS

The GIS UI should communicate:

    Multiple possible records found.

Do not automatically choose one.


# 68. GIS SEARCH RESULT

A search result should show enough information to distinguish parcels.

Example:

    Survey No: 101
    Village: Simariya
    Khata: 2305
    Area: 0.72 ha

Clicking it should:

    select polygon
    zoom map
    open details


# 69. MAP EXTENT

Initial map:

    fit to all available parcels

If a URL specifies a parcel/record:

    fit to selected parcel(s)

If a Khata contains multiple parcels:

    fit to all associated parcels


# 70. LEGEND

Minimum legend:

    Parcel
    Selected Parcel
    Entire Holding
    Unmatched Parcel
    Demo Geometry

Do not overcomplicate the legend.


# 71. DEMO DATA BANNER

Because GIS-1 may use synthetic geometry, show a visible but
non-intrusive banner:

    Prototype GIS Data
    Parcel boundaries shown here are demo geometry and are not
    authoritative cadastral boundaries.

This banner should disappear or change automatically once a future
authoritative dataset is loaded.


# 72. REAL DATA MODE

Future architecture should support:

    DEMO MODE

and:

    AUTHORITATIVE DATA MODE

Conceptually:

    data_source_mode:
        demo
        authoritative

GIS-1 may hardcode demo mode through configuration if a full mode
system is unnecessary.

Do not fake authoritative mode.


# 73. FUTURE IMPORT PIPELINE

Future spatial import:

SHP / GeoJSON / GeoPackage
        ↓
Validation
        ↓
CRS normalization
        ↓
Schema normalization
        ↓
Identifier matching
        ↓
Quality checks
        ↓
Spatial database
        ↓
GIS API


# 74. FUTURE CADASTRAL QUALITY CHECKS

A mature version should compare:

Record:

    Survey 101
    Area = 0.72 ha

Map:

    Survey 101
    Geometry Area = 0.70 ha

System can flag:

    AREA MISMATCH

Other checks:

- parcel present in record but absent in map
- parcel present in map but absent in record
- duplicate survey number
- duplicate spatial parcel ID
- invalid geometry
- missing identifiers

This should be future functionality unless simple checks fit naturally
into GIS-1.


# 75. FUTURE MUTATION SUPPORT

Do not implement parcel mutation editing in GIS-1.

Future:

    Mutation Request
        ↓
    Approval
        ↓
    Spatial Edit
        ↓
    Validation
        ↓
    Versioned Geometry
        ↓
    Updated RoR

Cadastral history must eventually be versioned rather than silently
overwriting authoritative geometry.


# 76. FUTURE VERSIONING

Production parcel geometry should eventually support:

    geometry_version
    valid_from
    valid_to
    mutation_reference
    source_document
    changed_by
    changed_at

This enables historical land-map reconstruction.

GIS-1 does not need full temporal versioning.


# 77. FUTURE ULPIN INTEGRATION

The long-term identity model should support official parcel identifiers
such as ULPIN/Bhu-Aadhaar where available.

Future matching:

    ULPIN
       ↓
    Parcel Geometry
       ↓
    Khata / RoR
       ↓
    Owner / Rights

ULPIN must not be invented or randomly generated and presented as an
official identifier.


# 78. Bhu-Naksha / DILRMP COMPATIBILITY

The architecture should conceptually remain compatible with India's
land-record modernization ecosystem.

Relevant capabilities to keep in mind for future integration include:

- cadastral parcel management
- map/RoR integration
- layer styling
- plot search
- parcel map visualization
- digitization quality checks
- spatial/textual record linkage

However:

GIS-1 is NOT a Bhu-Naksha implementation.

GIS-1 is NOT a DILRMP production integration.

Do not claim official integration unless a real supported interface/data
source has actually been connected.


# 79. DOCUMENTATION REQUIREMENT

Add comments/documentation where architecture may otherwise be unclear.

Especially document:

- spatial source
- coordinate system
- matching key
- demo geometry status
- API response structure

Avoid excessive comments explaining obvious JavaScript or Python.


# 80. CODE QUALITY

Follow the existing project's conventions.

Avoid:

- duplicated API logic
- duplicated matching code
- giant React components where avoidable
- unnecessary dependencies
- hardcoded business logic scattered across UI
- magic numbers without explanation
- silently swallowed errors


# 81. TESTING — BACKEND

At minimum test:

1. GET /api/gis/parcels
2. Filter by village
3. Filter by survey number
4. Filter by Khata
5. Get individual parcel
6. Get Khata parcels
7. matched parcel
8. unmatched parcel
9. ambiguous match if test data permits
10. invalid request
11. empty result
12. missing geometry


# 82. TESTING — FRONTEND

Verify:

[ ] GIS page loads

[ ] Map renders

[ ] GeoJSON polygons appear

[ ] Polygon click works

[ ] Parcel details appear

[ ] Search works

[ ] Search zooms map

[ ] Administrative filters work

[ ] Khata filter works

[ ] Entire holding works

[ ] GIS → Record works

[ ] Record → GIS works

[ ] Demo geometry warning appears

[ ] Loading state works

[ ] Error state works

[ ] Empty state works


# 83. REGRESSION TESTING

After GIS implementation verify:

[ ] Upload PDF works

[ ] OCR works

[ ] Field extraction works

[ ] Validation works

[ ] Review page works

[ ] Save record works

[ ] Records registry works

[ ] Record Detail works

[ ] Dashboard works

[ ] Delete works

[ ] Reset works

The GIS feature is considered incomplete if it breaks existing
functionality.


# 84. ACCEPTANCE CRITERIA

GIS-1 is accepted only if ALL of the following are true:

AC-01:
A dedicated GIS route exists.

AC-02:
An interactive map renders.

AC-03:
Cadastral GeoJSON polygons render.

AC-04:
User can click a parcel.

AC-05:
Parcel information appears.

AC-06:
User can search by survey/khasra number.

AC-07:
Search focuses/highlights the correct parcel.

AC-08:
Administrative filtering works.

AC-09:
Parcel can be linked to an existing land record.

AC-10:
Existing Record Detail page can open the parcel on the map.

AC-11:
A Khata with multiple parcels can display its entire holding.

AC-12:
Unmatched parcels are explicitly identified.

AC-13:
Ambiguous matches are not silently resolved.

AC-14:
Demo geometry is clearly identified.

AC-15:
No synthetic geometry is represented as authoritative.

AC-16:
Existing IDVRS functionality continues working.

AC-17:
No unnecessary migration to PostGIS occurs in GIS-1.

AC-18:
GIS API is separated from unrelated APIs.

AC-19:
Geometry CRS is explicitly documented.

AC-20:
The implementation is structured so future real cadastral data can
replace demo GeoJSON without rewriting the frontend.


# 85. DEFINITION OF DONE

The GIS feature is DONE when:

Frontend:

    /gis works

Backend:

    GIS API works

Spatial:

    GeoJSON loads

Integration:

    Parcel ↔ Khata ↔ Record works

User Experience:

    Search + filter + selection + zoom works

Data Integrity:

    No false authoritative claims

Regression:

    Existing IDVRS system remains functional

Documentation:

    Spatial architecture is documented

Testing:

    Acceptance criteria have been verified


# 86. WHAT MUST NOT BE DONE

DO NOT:

1. Rewrite the existing IDVRS architecture without necessity.

2. Replace MySQL with PostgreSQL/PostGIS in GIS-1.

3. Invent government cadastral boundaries.

4. Present synthetic polygons as official.

5. Claim Bhu-Naksha integration without actually integrating it.

6. Claim DILRMP integration without actually integrating it.

7. Invent ULPIN values.

8. Treat area as a geographic coordinate.

9. Use owner name alone as a parcel identity key.

10. Silently match ambiguous records.

11. Break existing document processing functionality.

12. Add multiple GIS frameworks unnecessarily.

13. Add a large GIS server stack just for the prototype.

14. Add unnecessary cloud dependencies.

15. Hide data provenance.

16. Make the GIS page dependent on hardcoded record IDs.

17. Replace recorded area with calculated geometry area silently.

18. Modify unrelated modules merely for cosmetic refactoring.


# 87. FUTURE ROADMAP

GIS-1
------
Working prototype map engine

    GeoJSON
    Leaflet
    FastAPI
    MySQL integration
    Search
    Parcel selection
    Record linkage


GIS-2
------
Real cadastral data integration

    Government/state spatial datasets
    SHP / GeoPackage / GeoJSON
    CRS transformation
    Spatial validation
    Better matching
    Dataset metadata
    Area comparison
    Quality checks


GIS-3
------
Production geospatial infrastructure

    PostgreSQL + PostGIS
    GeoServer / spatial services
    OGC APIs
    Spatial indexing
    Vector tiles
    authoritative datasets
    ULPIN
    State LRMS integration
    Bhu-Naksha integration where officially supported
    mutation/versioning
    audit trail
    RBAC


GIS-4
------
Advanced land intelligence

    parcel change detection
    map-RoR discrepancy detection
    mutation visualization
    historical parcel versions
    spatial analytics
    automated anomaly detection
    survey/GNSS integration
    satellite/drone-derived contextual layers


# 88. DEMO SCRIPT

The GIS feature should support this hackathon demonstration:

STEP 1

Open IDVRS.

STEP 2

Open an existing processed land record.

STEP 3

Show:

    Khata
    Owner
    Survey numbers
    Area

STEP 4

Click:

    View on Map

STEP 5

GIS page opens.

STEP 6

The relevant parcel is automatically highlighted.

STEP 7

Zoom into the parcel.

STEP 8

Click parcel.

Show:

    Survey No.
    Khata No.
    Area
    Land Use
    Village
    Match Status

STEP 9

Click:

    View Entire Holding

STEP 10

Show all parcels associated with that Khata.

STEP 11

Click:

    Open Land Record

STEP 12

Return to Record Detail.

This demonstrates:

    Document
       ↓
    Extracted Record
       ↓
    Structured Land Data
       ↓
    Spatial Parcel
       ↓
    Integrated GIS View


# 89. JUDGE-FACING EXPLANATION

The implementation should make it possible to explain:

"IDVRS does not treat land records as isolated text.
It links structured RoR/land-record information with cadastral parcel
geometry through stable parcel identifiers.

The current hackathon prototype demonstrates this using a controlled
GeoJSON spatial layer.

The spatial layer is deliberately separated from the relational
land-record database so that authoritative state/UT cadastral datasets
can later be integrated without redesigning the complete application."

Do NOT say:

"We already have official government cadastral maps"

unless this is actually true for the deployed dataset.


# 90. ENGINEERING PRINCIPLE

The most important architectural goal is:

BUILD THE ENGINE NOW,
PLUG AUTHORITATIVE DATA LATER.

The system should not be tightly coupled to demo polygons.

Today:

    Demo GeoJSON
        ↓
    GIS API
        ↓
    Leaflet

Tomorrow:

    Government Cadastral Dataset
        ↓
    Spatial Import / Adapter
        ↓
    Spatial Database
        ↓
    GIS API
        ↓
    Leaflet

The frontend user experience should remain mostly unchanged.


# 91. FINAL IMPLEMENTATION INSTRUCTION

Before changing any code:

1. Inspect the current IDVRS repository.
2. Understand the current database models.
3. Understand existing record APIs.
4. Understand existing React routes and layout.
5. Confirm the existing application still works.

Then implement GIS-1 incrementally.

After every major change verify that the application still starts.

At the end:

1. Run backend.
2. Run frontend.
3. Test GIS API.
4. Test GIS page.
5. Test parcel selection.
6. Test search.
7. Test filters.
8. Test Khata holding.
9. Test Record → GIS.
10. Test GIS → Record.
11. Run regression checks on existing IDVRS features.

Do not stop after creating the UI.

The GIS feature must be functionally connected end-to-end.

END OF GIS-1 PRD
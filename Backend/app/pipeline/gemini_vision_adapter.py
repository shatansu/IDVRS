import os
import io
import json
import base64
import logging
from pathlib import Path
from typing import Optional, Dict, Any, List

import httpx
from PIL import Image
from dotenv import load_dotenv

from app.pipeline.ocr_types import OCRResult, OCRTextBlock
from app.pipeline.field_extractor import compute_field_confidence

logger = logging.getLogger("app.pipeline.gemini_vision")

# Ensure .env is loaded
load_dotenv()

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")


def get_gemini_api_key() -> Optional[str]:
    """Retrieve Gemini API key from environment variables or .env file with override=True."""
    backend_env = Path(__file__).resolve().parent.parent.parent / ".env"
    if backend_env.exists():
        load_dotenv(backend_env, override=True)

    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if api_key and api_key.strip():
        return api_key.strip()

    # Direct file parse fallback in case os.environ is locked or cached
    if backend_env.exists():
        try:
            with open(backend_env, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("GEMINI_API_KEY=") or line.startswith("GOOGLE_API_KEY="):
                        val = line.split("=", 1)[1].strip().strip('"').strip("'")
                        if val:
                            os.environ["GEMINI_API_KEY"] = val
                            return val
        except Exception:
            pass
    return None


def _image_to_base64_part(image_path_or_pil: str | Image.Image) -> Dict[str, Any]:
    """Converts a file path or PIL image into Gemini inlineData format."""
    if isinstance(image_path_or_pil, str):
        path = Path(image_path_or_pil)
        ext = path.suffix.lower()
        if ext in (".jpg", ".jpeg"):
            mime_type = "image/jpeg"
        elif ext == ".png":
            mime_type = "image/png"
        elif ext == ".webp":
            mime_type = "image/webp"
        else:
            mime_type = "image/jpeg"

        with open(image_path_or_pil, "rb") as f:
            b64_data = base64.b64encode(f.read()).decode("utf-8")
    else:
        mime_type = "image/jpeg"
        buffered = io.BytesIO()
        image_path_or_pil.convert("RGB").save(buffered, format="JPEG", quality=95)
        b64_data = base64.b64encode(buffered.getvalue()).decode("utf-8")

    return {
        "inlineData": {
            "mimeType": mime_type,
            "data": b64_data,
        }
    }


def _build_extraction_prompt() -> str:
    return """You are an expert AI Indian Land Record Digitization and Revenue Intelligence Engine.
Analyze the provided land document image or PDF thoroughly. It may contain handwritten notes, revenue registers, mutation registers / नामांतरण पंजी, certified copies / सत्य प्रतिलिपि / नकल, sale deeds / बैनामा, partition orders / बंटवारा, khasra/khatoni/jamabandi records, family trees / वंशावली, or official revenue stamps and circular seals.

FIRST: Read and scan the ENTIRE document from top to bottom, including:
- Top headers, case numbers, dispatch numbers, dates, and references.
- All round/rectangular administrative stamps and seals (मुहर / सील / तहसीलदार / न्यायालय कार्यालय).
- Narrative sentences and descriptive paragraphs across all columns (e.g. sentences mentioning 'ग्राम ...', 'मौजा ...', 'तहसील ...', 'आदेश हुआ कि...').
- Table columns for khasra/survey numbers, areas, land revenue, and remarks.
- Handwritten co-owner lists and heir names with parent/spouse/relationship notes.

EXTRACT all available land administration data and return a strictly valid JSON object matching this schema:

{
  "document_type": "string or null (e.g. 'सत्य प्रतिलिपि / Certified Copy', 'नामांतरण पंजी / Mutation Register', 'बंटवारा आदेश / Partition Order', 'भू-अभिलेख / Land Record', 'बैनामा / Sale Deed', etc.)",
  "clrm_no": "string or null (Dispatch number, Order number, Case number, CLRM number, Vasika number, or register reference)",
  "village": "string or null (Village / ग्राम / मौजा name - search everywhere including narrative sentences, stamps, headers, or body text)",
  "tehsil": "string or null (Tehsil / तहसील / ताल्लुका name - search everywhere including seals, stamps, or body text)",
  "district": "string or null (District / जिला name - search everywhere including seals, stamps, or body text)",
  "state": "string or null (State / राज्य name if stated or indicated in seals/text)",
  "khata_number": "string or null (Khata / Khatoni / Jamabandi number, or account / entry / serial number / क्रमांक of the record. Check column headers, table cells, or text)",
  "fasli_year": "string or null (Fasli year, Samvat, or calendar year / date)",
  "patwari_halka_no": "string or null (Patwari halka, revenue circle, or sector number)",
  "owners": [
    {
      "owner_name": "string (Full name of owner, co-owner, shareholder, heir, or transferee)",
      "parent_or_spouse_name": "string or null (Father / Husband / Mother / Guardian name)",
      "address": "string or null (Residence address or village if mentioned)",
      "share_fraction": "string or null (Share fraction or proportion, e.g. '1/2', '1/3', '1/4', 'पूर्ण', or decimal if mentioned)",
      "ownership_status": "string or null (Tenure status e.g. 'भूमिस्वामी', 'खातेदार', 'काश्तकार', 'वारिसदार', 'बेवा', 'नाबालिग', etc.)"
    }
  ],
  "parcels": [
    {
      "survey_number": "string (Survey number, Khasra number, Araji number, or Plot number)",
      "area_hectare": float or null (Area in hectares as a decimal number. If given in bigha, biswa, or acre, calculate and convert to hectare)",
      "land_use": "string or null (Land use classification e.g. 'कृषि', 'आवासीय', 'व्यावसायिक', 'बंजर', 'सिंचित')",
      "land_revenue_rs": float or null (Land revenue / lagaan / rent in rupees as a decimal number)"
    }
  ],
  "summary_notes": "string or null (Concise summary of order or remarks)"
}

Rules:
1. Do not hardcode or bias toward any specific state or template. Generalize across all Indian land records.
2. Even if village, tehsil, district, or khata number are written inside a narrative sentence, table column, or inside an official stamp/seal rather than a designated box, extract them accurately into their respective fields!
3. Do not fabricate values. If a field is not mentioned or illegible, return null for that field.
4. If multiple co-owners, heirs, or applicants are listed, extract every single one into the 'owners' list.
5. If multiple survey/khasra numbers or plots are listed, extract every single one into the 'parcels' list.
6. Return ONLY valid JSON, with no markdown code fences or conversational text.
"""


def extract_handwritten_with_gemini(
    file_path: str,
    api_key: Optional[str] = None,
    model: str = DEFAULT_MODEL
) -> Optional[Dict[str, Any]]:
    """
    Extracts structured land record data from handwritten/scanned documents using Gemini Vision API.
    Supports automatic multi-model fallback across healthy Gemini models.
    Returns standard IDVRS dictionary structure or None if API key is missing or calls fail.
    """
    key = api_key or get_gemini_api_key()
    if not key:
        logger.info("No GEMINI_API_KEY configured. Skipping Gemini Vision extraction.")
        return None

    path = Path(file_path)
    if not path.exists():
        logger.error(f"File not found: {file_path}")
        return None

    # Prepare image payload
    contents_parts: List[Dict[str, Any]] = []

    ext = path.suffix.lower()
    if ext == ".pdf":
        import pymupdf
        with pymupdf.open(file_path) as doc:
            for page_num, page in enumerate(doc):
                pix = page.get_pixmap(dpi=200)
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                contents_parts.append(_image_to_base64_part(img))
                if page_num >= 2:  # limit to first 3 pages for speed
                    break
    else:
        contents_parts.append(_image_to_base64_part(file_path))

    contents_parts.append({"text": _build_extraction_prompt()})

    payload = {
        "contents": [{"parts": contents_parts}],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json",
        }
    }

    # Candidate models for high availability and fail-safe extraction
    candidate_models = [model, "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-3-flash-preview", "gemini-3.5-flash", "gemini-flash-latest"]
    seen = set()
    models_to_try = [m for m in candidate_models if m and not (m in seen or seen.add(m))]

    for try_model in models_to_try:
        url = f"{GEMINI_API_BASE}/{try_model}:generateContent?key={key}"
        try:
            logger.info(f"Invoking Gemini Vision ({try_model}) for {file_path}")
            with httpx.Client(timeout=45.0) as client:
                response = client.post(url, json=payload)

            if response.status_code == 200:
                result_json = response.json()
                candidates = result_json.get("candidates", [])
                if candidates:
                    content = candidates[0].get("content", {})
                    parts = content.get("parts", [])
                    if parts:
                        raw_text_response = parts[0].get("text", "").strip()
                        if raw_text_response.startswith("```"):
                            lines = raw_text_response.splitlines()
                            if lines[0].startswith("```"):
                                lines = lines[1:]
                            if lines and lines[-1].strip() == "```":
                                lines = lines[:-1]
                            raw_text_response = "\n".join(lines).strip()
                        parsed_data = json.loads(raw_text_response)
                        return _format_gemini_to_idvrs_schema(parsed_data)

            logger.warning(
                f"Gemini model {try_model} returned HTTP {response.status_code}: {response.text[:200]}. Trying next fallback model..."
            )
        except Exception as e:
            logger.warning(f"Error calling Gemini model {try_model}: {e}. Trying next fallback model...")
            continue

    logger.error("All candidate Gemini models failed.")
    return None


def _format_gemini_to_idvrs_schema(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Transforms Gemini JSON response into IDVRS standard field/confidence schema.
    Applies dynamic field validation and token-based confidence scoring.
    """
    def _wrap(val: Any, field_name: str, match_type: str = "labeled") -> Dict[str, Any]:
        if val is None or str(val).strip().lower() in ("", "null", "none"):
            return {"value": None, "confidence": 0.0}
        conf = compute_field_confidence(field_name, val, match_type)
        return {"value": val, "confidence": round(conf, 2)}

    # Khata fields
    khata = {
        "clrm_no": _wrap(data.get("clrm_no"), "clrm_no", "labeled"),
        "village": _wrap(data.get("village"), "village", "labeled"),
        "tehsil": _wrap(data.get("tehsil"), "tehsil", "labeled"),
        "district": _wrap(data.get("district"), "district", "labeled"),
        "khata_number": _wrap(data.get("khata_number"), "khata_number", "labeled"),
        "fasli_year": _wrap(data.get("fasli_year"), "fasli_year", "labeled"),
        "patwari_halka_no": _wrap(data.get("patwari_halka_no"), "patwari_halka_no", "labeled"),
        "state": _wrap(data.get("state"), "state", "labeled"),
        "document_type": _wrap(data.get("document_type") or "Handwritten Land Record", "document_type", "labeled"),
    }

    # Owners
    owners: List[Dict[str, Any]] = []
    raw_owners = data.get("owners", [])
    if isinstance(raw_owners, list):
        for o in raw_owners:
            if not isinstance(o, dict):
                continue
            name = o.get("owner_name")
            if not name or str(name).strip().lower() in ("null", "none"):
                continue
            owners.append({
                "owner_name": _wrap(name, "owner_name", "row_parsed"),
                "parent_or_spouse_name": _wrap(o.get("parent_or_spouse_name"), "parent_or_spouse_name", "row_parsed"),
                "address": _wrap(o.get("address"), "address", "row_parsed"),
                "share_fraction": _wrap(o.get("share_fraction"), "share_fraction", "row_parsed"),
                "ownership_status": _wrap(o.get("ownership_status"), "ownership_status", "row_parsed"),
            })

    # Parcels
    parcels: List[Dict[str, Any]] = []
    raw_parcels = data.get("parcels", [])
    if isinstance(raw_parcels, list):
        for p in raw_parcels:
            if not isinstance(p, dict):
                continue
            s_num = p.get("survey_number")
            if not s_num:
                continue
            # Ensure area is float
            area_val = p.get("area_hectare")
            try:
                area_float = float(area_val) if area_val is not None else None
            except (ValueError, TypeError):
                area_float = None

            rev_val = p.get("land_revenue_rs")
            try:
                rev_float = float(rev_val) if rev_val is not None else None
            except (ValueError, TypeError):
                rev_float = None

            parcels.append({
                "parcel_unique_id": {"value": None, "confidence": 0.0},
                "survey_number": _wrap(str(s_num), "survey_number", "row_parsed"),
                "land_use_flag": {"value": None, "confidence": 0.0},
                "area_hectare": _wrap(area_float, "area_hectare", "row_parsed"),
                "land_use": _wrap(p.get("land_use"), "land_use", "row_parsed"),
                "land_revenue_rs": _wrap(rev_float, "land_revenue_rs", "row_parsed"),
            })

    # Confidence calculation over data fields
    khata_values = [v for k, v in khata.items() if v["value"] is not None and k != "document_type"]
    all_confs = (
        [v["confidence"] for v in khata_values] +
        [v["confidence"] for o in owners for v in o.values() if v["value"] is not None] +
        [v["confidence"] for p in parcels for v in p.values() if v["value"] is not None]
    )
    avg_conf = round(sum(all_confs) / len(all_confs), 4) if all_confs else 0.0

    required_fields = {"clrm_no", "village", "tehsil", "district", "khata_number"}
    missing_required = [f for f in required_fields if khata.get(f, {}).get("value") is None]

    extraction_meta = {
        "document_type": data.get("document_type") or "Handwritten Land Record",
        "khata_fields_found": len(khata_values),
        "khata_fields_total": len([k for k in khata if k != "document_type"]),
        "owners_found": len(owners),
        "parcels_found": len(parcels),
        "average_confidence": avg_conf,
        "missing_required_fields": missing_required,
        "needs_review": len(missing_required) > 0 or avg_conf < 0.70,
        "engine_used": "bhu_setu_neural_vision",
    }

    full_text = data.get("full_text_transcript") or ""
    if not full_text:
        # Fallback text representation
        lines = [f"दस्तावेज़ प्रकार: {data.get('document_type', '')}"]
        for k, v in khata.items():
            if v["value"]:
                lines.append(f"{k}: {v['value']}")
        for o in owners:
            lines.append(f"खातेदार: {o['owner_name']['value']} ({o['parent_or_spouse_name']['value']})")
        for p in parcels:
            lines.append(f"खसरा नं: {p['survey_number']['value']} रकबा: {p['area_hectare']['value']}")
        full_text = "\n".join(lines)

    return {
        "khata": khata,
        "owners": owners,
        "parcels": parcels,
        "extraction_meta": extraction_meta,
        "full_text": full_text,
    }

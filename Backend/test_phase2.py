import sys
import io
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models import Document

# Ensure utf-8 output on Windows console
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

client = TestClient(app)

docs_to_test = [
    'sample_docs/CertifiedCopy_Bhu-AdhikarPustika_25030879728.pdf',
    'sample_docs/CertifiedCopy_Khatoni(B1)Copy_25030868731.pdf'
]

print("=" * 80)
print("PHASE 2 EXTRACTION & UPLOAD VERIFICATION ON REAL CERTIFIED DOCUMENTS")
print("=" * 80)

for doc_path in docs_to_test:
    print("\n" + "#" * 80)
    print(f"TESTING FILE: {doc_path}")
    print("#" * 80)
    
    with open(doc_path, "rb") as f:
        file_content = f.read()
    
    filename = doc_path.split("/")[-1]
    response = client.post(
        "/api/upload",
        files={"file": (filename, file_content, "application/pdf")}
    )
    
    print(f"HTTP Status Code: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"Document ID in DB: {data['document_id']}")
        print(f"Original Filename: {data['original_filename']}")
        print(f"Detected Source Mode: {data['source_mode']}")
        print(f"Inferred Document Type: {data['document_type']}")
        print(f"Page Count: {data['page_count']}")
        print(f"Character Count: {data['character_count']}")
        print(f"Confidence Score: {data['average_confidence']}")
        print("\n" + "-" * 40 + " RAW EXTRACTED TEXT SAMPLE " + "-" * 40)
        lines = [l for l in data['raw_text'].splitlines() if l.strip()]
        for idx, line in enumerate(lines[:35]):
            print(f"[{idx+1:02d}] {line}")
        if len(lines) > 35:
            print(f"... ({len(lines) - 35} more non-empty lines extracted) ...")
            print("--- LAST 10 LINES ---")
            for idx, line in enumerate(lines[-10:]):
                print(f"[{len(lines)-10+idx+1:02d}] {line}")
    else:
        print("Upload Error:", response.text)

# Query MySQL database to verify persistence
print("\n" + "=" * 80)
print("MYSQL DATABASE PERSISTENCE VERIFICATION (`documents` table)")
print("=" * 80)

db = SessionLocal()
records = db.query(Document).order_by(Document.id.desc()).limit(5).all()
print(f"Total verified recent records: {len(records)}")
for r in reversed(records):
    text_len = len(r.raw_extracted_text) if r.raw_extracted_text else 0
    print(
        f"ID: {r.id} | Filename: {r.original_filename} | Mode: {r.source_mode.value} | "
        f"Type: {r.document_type} | Status: {r.processing_status.value} | Text Chars: {text_len}"
    )
db.close()

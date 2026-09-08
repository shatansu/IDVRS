import os
import sys
import traceback
from pathlib import Path

# Add Backend root directory to sys.path so 'app' package imports work cleanly
backend_dir = str(Path(__file__).resolve().parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

try:
    from app.main import app
except Exception as exc:
    err_trace = traceback.format_exc()
    from fastapi import FastAPI
    from fastapi.responses import PlainTextResponse
    
    app = FastAPI()
    
    @app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
    async def debug_error(full_path: str):
        return PlainTextResponse(f"Backend Initialization Error on Vercel:\n\n{err_trace}", status_code=500)

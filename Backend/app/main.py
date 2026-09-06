import logging
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import inspect

from app.config import settings
from app.database import engine, get_db, check_db_connection
from app.init_db import create_database_if_not_exists, init_tables
from app.api.upload import router as upload_router
from app.api.records import router as records_router
from app.api.dashboard import router as dashboard_router

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("app.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure database & tables exist
    logger.info("Starting up Land Record Digitization API...")
    create_database_if_not_exists()
    init_tables()
    yield
    # Shutdown
    logger.info("Shutting down Land Record Digitization API...")

app = FastAPI(
    title="Intelligent Land Record Digitization & Validation System API",
    description="Backend API for OCR, field extraction, validation, and storage of land records (Madhya Pradesh / Pan-India).",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(upload_router)
app.include_router(records_router)
app.include_router(dashboard_router)

@app.get("/", tags=["General"])
def root():
    return {
        "title": "Intelligent Land Record Digitization API",
        "version": "1.0.0",
        "docs_url": "/docs",
        "status": "online",
        "health_check": "/api/ping",
        "upload_endpoint": "/api/upload"
    }

@app.get("/api/ping", tags=["Health"])
def ping(db: Session = Depends(get_db)):
    """
    Health-check endpoint confirming backend is alive and MySQL connection is operational.
    """
    db_status = check_db_connection()
    
    # Retrieve existing tables list
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    
    return {
        "status": "ok",
        "message": "pong",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database": db_status,
        "tables": tables,
        "phase": "Phase 6 - Records List + Dashboard"
    }

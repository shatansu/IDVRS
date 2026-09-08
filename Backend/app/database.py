import logging
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings

logger = logging.getLogger("app.database")

# Determine connect_args for cloud databases (e.g. TiDB Cloud requires SSL)
connect_args = {}
db_url_lower = settings.database_url.lower()
if "tidbcloud" in db_url_lower or "ssl" in db_url_lower:
    connect_args["ssl"] = {"ssl_mode": "REQUIRED"}

# SQLAlchemy Engine for the target database
engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    pool_pre_ping=True,
    pool_recycle=300,
    echo=False
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    """Dependency that yields a database session and closes it afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def check_db_connection() -> dict:
    """
    Checks if the MySQL database is reachable and returns status details.
    """
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1 AS ping;"))
            row = result.fetchone()
            if row and row[0] == 1:
                return {
                    "connected": True,
                    "database": settings.DB_NAME,
                    "host": settings.DB_HOST,
                    "port": settings.DB_PORT,
                    "message": "Database connection verified successfully"
                }
    except Exception as exc:
        logger.error(f"Database connection check failed: {exc}")
        return {
            "connected": False,
            "database": settings.DB_NAME,
            "host": settings.DB_HOST,
            "port": settings.DB_PORT,
            "error": str(exc)
        }
    return {
        "connected": False,
        "database": settings.DB_NAME,
        "error": "Unknown connection state"
    }

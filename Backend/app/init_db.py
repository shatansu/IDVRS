import logging
from sqlalchemy import create_engine, text, inspect
from app.config import settings
from app.database import engine, Base
import app.models  # Ensure all models are registered with Base.metadata

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("app.init_db")

def create_database_if_not_exists():
    """Connects to MySQL server and creates the target database if it doesn't exist."""
    server_engine = create_engine(settings.server_database_url, echo=False)
    try:
        with server_engine.connect() as conn:
            conn.execute(text(
                f"CREATE DATABASE IF NOT EXISTS `{settings.DB_NAME}` "
                f"CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
            ))
            conn.commit()
            logger.info(f"Database '{settings.DB_NAME}' created or already exists (utf8mb4).")
    finally:
        server_engine.dispose()

def init_tables():
    """Initializes all database tables defined in SQLAlchemy models."""
    logger.info("Creating tables...")
    Base.metadata.create_all(bind=engine)
    
    # Inspect tables to confirm
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    logger.info(f"Tables in '{settings.DB_NAME}': {tables}")
    return tables

def main():
    create_database_if_not_exists()
    tables = init_tables()
    print("Database and tables initialized successfully!")
    print(f"Created/Verified tables: {', '.join(tables)}")

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
import logging
import os
import sys
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s", handlers=[logging.StreamHandler(sys.stdout)])
log = logging.getLogger(__name__)
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sqlalchemy import MetaData
from app.core.database import Base, engine
# IMPORT MODELS TO REGISTER TABLES
from app.models.item import Item
from app.models.audit import AuditLog
from app.models.settings import Settings

def reset_database():
    log.info("Connecting to the database...")
    try:
        log.info("Dropping all existing tables...")
        metadata = MetaData()
        metadata.reflect(bind=engine)
        metadata.drop_all(bind=engine)
        log.info("Creating all tables from SQLAlchemy metadata...")
        Base.metadata.create_all(bind=engine)
        log.info("✅ Database reset successfully.")
    except Exception as e:
        log.error(f"❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    reset_database()
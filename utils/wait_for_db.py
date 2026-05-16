#!/usr/bin/env python3
"""
Database readiness checker script.
Waits for the configured database to be reachable before proceeding with migrations.
Supports SQLite file URLs and network databases via SQLAlchemy.
"""

import logging
import os
import sys
import time
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine.url import make_url

# Set up logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


DEFAULT_DATABASE_URL = "sqlite:///./data/aegis_nexus.db"


def ensure_sqlite_directory(database_url: str) -> None:
    url = make_url(database_url)
    if not url.drivername.startswith("sqlite"):
        return

    database_path = url.database
    if database_path and database_path != ":memory:":
        Path(database_path).expanduser().parent.mkdir(parents=True, exist_ok=True)


def check_db_connection():
    database_url = os.getenv("DATABASE_URL", "")
    # 🔥 HACKATHON SHIELD: If using SQLite, bypass the network check entirely
    if database_url.startswith("sqlite"):
        return True
    
    try:
        import psycopg2

def wait_for_database(max_retries=30, delay=2):
    """
    Wait for the database to be ready with exponential backoff.

    Args:
        max_retries: Maximum number of retry attempts
        delay: Initial delay between retries (seconds)
    """
    logger.info("🔍 Waiting for database to be ready...")

    for attempt in range(max_retries):
        if check_db_connection():
            logger.info(f"🎉 Database is ready! (attempt {attempt + 1})")
            return True

        if attempt < max_retries - 1:
            wait_time = min(delay * (1.5**attempt), 30)  # Exponential backoff, max 30s
            logger.info(
                f"⏳ Database not ready yet. Retrying in {wait_time:.1f}s... (attempt {attempt + 1}/{max_retries})"
            )
            time.sleep(wait_time)

    logger.error(f"❌ Failed to connect to database after {max_retries} attempts")
    return False


if __name__ == "__main__":
    # Check if we should skip the wait (for testing purposes)
    if os.getenv("SKIP_DB_WAIT", "").lower() == "true":
        logger.info("⏭️  Skipping database wait (SKIP_DB_WAIT=true)")
        sys.exit(0)

    # Wait for database
    if wait_for_database():
        logger.info("✅ Database is ready, proceeding with application startup...")
        sys.exit(0)
    else:
        logger.error("❌ Database is not available, exiting...")
        sys.exit(1)

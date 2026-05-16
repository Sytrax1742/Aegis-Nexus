#!/usr/bin/env python3
"""
Database cleanup script.
Drops all tables in the configured database.
Used by the cleanup-db Cloud Run Job.
"""

import logging
import os
import sys

# Configure logging for scripts
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger(__name__)


def cleanup_database():
    log.info("🗑️  Cleaning database...")

    try:
        from sqlalchemy import MetaData

        metadata = MetaData()
        metadata.reflect(bind=engine)
        metadata.drop_all(bind=engine)

        log.info("✅ Database cleaned! All tables dropped.")

    except Exception as e:
        log.error(f"❌ Error cleaning database: {e}")
        sys.exit(1)


if __name__ == "__main__":
    cleanup_database()

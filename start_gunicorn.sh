#!/bin/bash
python utils/wait_for_db.py
alembic upgrade head
gunicorn -c gunicorn/dev.py app.main:app
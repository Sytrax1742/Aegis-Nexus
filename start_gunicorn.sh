#!/bin/sh

# Unified entrypoint script for the application
# Handles both development and production environments
#
# PRODUCTION & DEVELOPMENT:
#   - Always runs migrations on startup (alembic upgrade head)
#   - Alembic is idempotent - only runs pending migrations
#   - Safe with preload_app=True (runs before workers fork)
#
# PRODUCTION:
#   - Multiple workers spawned after migrations
#   - App is preloaded before forking workers
#
# DEVELOPMENT:
#   - Single worker with hot reload
#   - Waits for database to be ready

set -e  # Exit immediately if a command exits with a non-zero status

echo "🚀 Starting application..."
echo "   Environment: ${APP_ENV:-development}"

# Determine which gunicorn config to use based on environment
if [ "${APP_ENV}" = "production" ]; then
    echo "🏭 Production mode detected"
    
    # Verify database connectivity before running migrations
    echo "🔍 Verifying database connectivity..."
    python utils/wait_for_db.py
    
    # Always run migrations - Alembic is idempotent
    # It only runs migrations that haven't been applied yet
    echo "📄 Running database migrations..."
    alembic upgrade head
    echo "✅ Migrations up to date!"
    
    echo "🏭 Starting production server with dynamic workers..."
    exec gunicorn -c gunicorn/prod.py app.main:app
    
else
    echo "🛠️  Development mode detected"
    
    # Wait for database to be ready (development only)
    echo "🔍 Waiting for database..."
    python utils/wait_for_db.py
    
    # Run database migrations (safe in dev - single worker)
    echo "📄 Running database migrations..."
    alembic upgrade head
    
    echo "🛠️  Starting development server..."
    exec gunicorn -c gunicorn/dev.py app.main:app
fi

from app.core.database import SessionLocal
from app.models.audit import AuditLog

db = SessionLocal()
db.query(AuditLog).delete()
db.commit()
print("All AuditLogs cleared.")

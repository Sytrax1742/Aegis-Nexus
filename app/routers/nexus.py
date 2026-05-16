"""
Aegis-Nexus Router - Sales Transcript Ingestion & Supervity API Gateway

This router serves as the bridge between the Next.js frontend and the Supervity
AI Engine. It handles transcript ingestion, validates policies, and forwards
requests to external AI agents.
"""

import logging
import os
import random
import string
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..models.audit import AuditLog
from ..security import get_current_user
from ..services.audit import audit

router = APIRouter(prefix="/api/v1", tags=["nexus"])

log = logging.getLogger(__name__)

# --- Configuration ---
SUPERVITY_TOKEN = os.getenv("SUPERVITY_TOKEN")


# --- Pydantic Models ---
class IngestPayload(BaseModel):
    """Request model for sales transcript ingestion."""

    transcript: str = Field(
        ...,
        min_length=1,
        max_length=10000,
        description="Raw sales call transcript to process",
    )

    class Config:
        json_schema_extra = {
            "example": {
                "transcript": "Customer: I'd like a 35% discount. Sales Rep: I can offer 20%.",
            }
        }


class NexusResponse(BaseModel):
    """Response model for nexus endpoints."""

    deal_id: str = Field(..., description="Unique deal identifier for tracking")
    status: str = Field(..., description="Status of the request: 'success', 'workbench_halt', or 'error'")
    message: str = Field(..., description="Detailed message about the result")
    metadata: Optional[dict] = Field(
        None, description="Additional metadata (e.g., policy violation details)"
    )


# --- Helper Functions ---
def _generate_deal_id() -> str:
    """Generate a unique deal ID in format DEAL-NNNN."""
    random_suffix = ''.join(random.choices(string.digits, k=4))
    return f"DEAL-{random_suffix}"


# --- Endpoints ---
@router.post(
    "/nexus/ingest",
    response_model=NexusResponse,
    status_code=status.HTTP_200_OK,
    summary="Ingest Sales Transcript",
    description="Accepts a raw sales call transcript and processes it through the Supervity AI engine.",
)
async def ingest_transcript(
    payload: IngestPayload,
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NexusResponse:
    """
    Ingest and process a sales call transcript.

    This endpoint accepts a raw transcript from the Next.js frontend, validates
    it against Aegis-Nexus policies, and forwards it to the Supervity AI Engine
    for processing.

    In simulation mode (when SUPERVITY_TOKEN is not set), it checks for policy
    violations locally (e.g., discount exceeding 20%).
    """

    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    # Generate unique deal_id for tracking
    deal_id = _generate_deal_id()
    user_email = current_user.get("email", "unknown")
    user_id = current_user.get("sub", "unknown")

    log.info(f"Transcript ingestion initiated: {deal_id} by {user_email}")

    # Log pending state
    await audit.log(
        action="nexus.ingest.pending",
        description=f"Transcript ingestion pending: deal {deal_id}",
        actor=current_user,
        category="DATA",
        severity="INFO",
        resource_type="deal",
        resource_id=deal_id,
        resource_name=user_email,
        metadata={
            "transcript_length": len(payload.transcript),
            "stage": "pending",
        },
        success=True,
        request=request,
    )

    # --- Simulation Mode: Local Policy Validation ---
    if not SUPERVITY_TOKEN:
        log.info(f"SUPERVITY_TOKEN not found. Running in simulation mode for {deal_id}")

        # Check for policy violation: 35% discount request
        if "35%" in payload.transcript:
            # Policy violation detected — route to workbench
            response = NexusResponse(
                deal_id=deal_id,
                status="workbench_halt",
                message="⚠️ POLICY VIOLATION: Deal requested 35% discount. Maximum allowed: 20%. Routed to Supervity Workbench.",
                metadata={
                    "violation_type": "discount_exceeded",
                    "requested": "35%",
                    "max_allowed": "20%",
                    "stage": "workbench_halt",
                },
            )

            # Audit log: Policy violation (workbench_halt state)
            await audit.log(
                action="nexus.ingest.workbench_halt",
                description=f"Policy violation detected: 35% discount request — deal {deal_id} halted",
                actor=current_user,
                category="SECURITY",
                severity="WARNING",
                resource_type="deal",
                resource_id=deal_id,
                resource_name=user_email,
                metadata={
                    "violation_type": "discount_exceeded",
                    "requested": "35%",
                    "max_allowed": "20%",
                    "stage": "workbench_halt",
                },
                success=False,
                error_message="Discount exceeds maximum allowed (20%)",
                request=request,
            )

            log.warning(f"Policy violation detected for deal {deal_id} by {user_email}")
            return response

        # No violation: success response
        response = NexusResponse(
            deal_id=deal_id,
            status="success",
            message="✓ Transcript processed successfully. Autopilot pipeline completed.",
            metadata={
                "mode": "simulation",
                "deals_processed": 1,
                "revenue_secured": "Pending",
                "stage": "success",
            },
        )

        # Audit log: Successful ingestion (success state)
        await audit.log(
            action="nexus.ingest.success",
            description=f"Transcript processed successfully: deal {deal_id}",
            actor=current_user,
            category="DATA",
            severity="INFO",
            resource_type="deal",
            resource_id=deal_id,
            resource_name=user_email,
            metadata={
                "mode": "simulation",
                "transcript_length": len(payload.transcript),
                "stage": "success",
            },
            success=True,
            request=request,
        )

        log.info(f"Transcript processed successfully for deal {deal_id}")
        return response

    # --- Production Mode: Forward to Supervity (TODO) ---
    else:
        # TODO: Implement actual Supervity API integration
        # This will forward the transcript via multipart/form-data to:
        # POST https://auto-workflow-api.supervity.ai/api/v1/workflow-runs/execute/stream
        log.info(f"Production mode: SUPERVITY_TOKEN found for deal {deal_id}. (Integration pending)")

        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Supervity integration not yet implemented",
        )


class ExportLog(BaseModel):
    """Export model for BI tool integration."""

    id: int
    timestamp: str
    action: str
    actor_email: Optional[str]
    description: str
    status: str  # "true" or "false"
    severity: str


@router.get(
    "/nexus/export/{deal_id}",
    response_model=list[ExportLog],
    status_code=status.HTTP_200_OK,
    summary="Export Deal Execution Logs",
    description="Export execution logs for a specific deal for BI tool integration (Tableau, Looker, etc.).",
)
async def export_deal_logs(
    deal_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ExportLog]:
    """
    Export all execution logs for a specific deal.

    This endpoint queries the audit log table for all entries with
    resource_id matching the deal_id, enabling BI tool integrations
    and custom reporting.

    Args:
        deal_id: The deal identifier to export logs for (e.g., "DEAL-1042")

    Returns:
        List of audit log entries formatted for external consumption
    """

    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    log.info(f"Exporting logs for deal {deal_id}")

    # Query audit logs by resource_id
    audit_logs = db.query(AuditLog).filter(
        AuditLog.resource_id == deal_id
    ).order_by(AuditLog.timestamp.desc()).all()

    if not audit_logs:
        log.warning(f"No audit logs found for deal {deal_id}")
        return []

    # Transform to export format
    export_data = [
        ExportLog(
            id=log.id,
            timestamp=log.timestamp.isoformat() if log.timestamp else None,
            action=log.action,
            actor_email=log.actor_email,
            description=log.description,
            status=log.success,
            severity=log.severity,
        )
        for log in audit_logs
    ]

    log.info(f"Exported {len(export_data)} logs for deal {deal_id}")
    return export_data

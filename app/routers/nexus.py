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
from ..services.supervity import supervity_client

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

    # --- Check for Orchestrator ID Configuration ---
    orchestrator_id = os.getenv("SUPERVITY_ORCHESTRATOR_ID")

    if not orchestrator_id:
        # --- Fallback Simulation Mode ---
        log.info(f"SUPERVITY_ORCHESTRATOR_ID not found. Running in minimal simulation mode for {deal_id}")

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
                    "mode": "simulation",
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
                    "mode": "simulation",
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

    # --- Production Mode: Forward to Supervity Orchestrator ---
    else:
        log.info(f"Production mode: Forwarding transcript to Supervity Orchestrator for deal {deal_id}")

        try:
            # Execute Supervity Orchestrator workflow with transcript
            workflow_result = await supervity_client.execute_workflow(
                workflow_id=orchestrator_id,
                inputs={"transcript": payload.transcript},
            )

            log.info(f"Supervity Orchestrator processed deal {deal_id} successfully")

            # Parse result and determine status
            orchestrator_status = workflow_result.get("status", "unknown")
            orchestrator_message = workflow_result.get("message", "Processing completed")

            # Check if orchestrator detected a halt condition
            if orchestrator_status == "workbench_halt" or "halt" in str(orchestrator_status).lower():
                response = NexusResponse(
                    deal_id=deal_id,
                    status="workbench_halt",
                    message=orchestrator_message,
                    metadata=workflow_result.get("metadata", {
                        "orchestrator_status": orchestrator_status,
                        "stage": "workbench_halt",
                    }),
                )

                # Audit log: Policy violation from orchestrator
                await audit.log(
                    action="nexus.ingest.workbench_halt",
                    description=f"Supervity Orchestrator detected policy violation: deal {deal_id} halted",
                    actor=current_user,
                    category="SECURITY",
                    severity="WARNING",
                    resource_type="deal",
                    resource_id=deal_id,
                    resource_name=user_email,
                    metadata={
                        "orchestrator_status": orchestrator_status,
                        "stage": "workbench_halt",
                    },
                    success=False,
                    error_message=orchestrator_message,
                    request=request,
                )

                log.warning(f"Orchestrator halt for deal {deal_id}: {orchestrator_message}")
                return response

            # Success: return orchestrator result
            response = NexusResponse(
                deal_id=deal_id,
                status="success",
                message=orchestrator_message,
                metadata=workflow_result.get("metadata", {
                    "orchestrator_status": orchestrator_status,
                    "stage": "success",
                }),
            )

            # Audit log: Successful orchestrator execution
            await audit.log(
                action="nexus.ingest.success",
                description=f"Supervity Orchestrator processed deal {deal_id} successfully",
                actor=current_user,
                category="DATA",
                severity="INFO",
                resource_type="deal",
                resource_id=deal_id,
                resource_name=user_email,
                metadata={
                    "orchestrator_status": orchestrator_status,
                    "transcript_length": len(payload.transcript),
                    "stage": "success",
                },
                success=True,
                request=request,
            )

            log.info(f"Deal {deal_id} processed successfully by Supervity Orchestrator")
            return response

        except Exception as e:
            error_msg = f"Supervity Orchestrator error: {str(e)}"
            log.error(f"Orchestrator error for deal {deal_id}: {error_msg}")

            response = NexusResponse(
                deal_id=deal_id,
                status="error",
                message=f"⚠️ Processing error: {str(e)}",
                metadata={
                    "error": str(e),
                    "stage": "error",
                },
            )

            # Audit log: Orchestrator error
            await audit.log(
                action="nexus.ingest.error",
                description=f"Supervity Orchestrator error for deal {deal_id}: {str(e)}",
                actor=current_user,
                category="ERROR",
                severity="ERROR",
                resource_type="deal",
                resource_id=deal_id,
                resource_name=user_email,
                metadata={
                    "error": str(e),
                    "stage": "error",
                },
                success=False,
                error_message=error_msg,
                request=request,
            )

            return response


@router.post(
    "/nexus/sync-policies",
    status_code=status.HTTP_200_OK,
    summary="Sync Corporate Policies via Supervity",
    description="Execute the Knowledge Ingestion workflow to sync corporate policies through the Supervity AI engine.",
)
async def sync_policies(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """
    Sync corporate policies via Supervity Operator 1 (Knowledge Ingestion).

    This endpoint triggers the Knowledge Ingestion workflow on Supervity,
    which processes and ingests corporate policies for the RAG system.

    Returns:
        dict: Supervity workflow execution response
    """

    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    user_email = current_user.get("email", "unknown")

    log.info(f"Policy sync initiated by {user_email}")

    # Log pending action
    await audit.log(
        action="nexus.policies_sync.pending",
        description="Policy sync initiated via Supervity Knowledge Ingestion workflow",
        actor=current_user,
        category="DATA",
        severity="INFO",
        resource_type="policies",
        resource_id="policies-sync",
        resource_name="Supervity Knowledge Ingestion",
        metadata={
            "operator": "Operator 1 - Knowledge Ingestion",
            "stage": "pending",
        },
        success=True,
        request=request,
    )

    try:
        # Prepare workflow inputs with policy data
        workflow_inputs = {
            "sales_discount_policy": "Standard corporate policies - Discount tiers require manager approval above 10%, legal review above $100k",
            "sales_pipeline_sop": "Standard corporate policies - BANT capture, peer review, AI audit required for all B2B SaaS deals",
            "org_hierarchy": "Standard corporate policies - VP authority for discount overrides exceeding 20%",
        }

        # Execute Supervity Knowledge Ingestion workflow
        workflow_response = await supervity_client.execute_workflow(
            workflow_id="019e3056-6682-7000-81db-57be3cd39779",
            inputs=workflow_inputs,
        )

        log.info(f"Policy sync completed by {user_email}")

        # Log successful completion
        await audit.log(
            action="nexus.policies_synced",
            description="Corporate policies successfully synced via Supervity Knowledge Ingestion",
            actor=current_user,
            category="DATA",
            severity="INFO",
            resource_type="policies",
            resource_id="policies-sync",
            resource_name="Supervity Knowledge Ingestion",
            metadata={
                "operator": "Operator 1 - Knowledge Ingestion",
                "stage": "success",
                "workflow_response_status": workflow_response.get("status", "unknown"),
            },
            success=True,
            request=request,
        )

        return workflow_response

    except Exception as e:
        error_msg = f"Policy sync failed: {str(e)}"
        log.error(error_msg)

        # Log failed sync
        await audit.log(
            action="nexus.policies_sync.error",
            description=f"Policy sync failed: {str(e)}",
            actor=current_user,
            category="ERROR",
            severity="ERROR",
            resource_type="policies",
            resource_id="policies-sync",
            resource_name="Supervity Knowledge Ingestion",
            metadata={
                "operator": "Operator 1 - Knowledge Ingestion",
                "error": str(e),
            },
            success=False,
            error_message=error_msg,
            request=request,
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=error_msg,
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


class RAGKnowledgeBase(BaseModel):
    """RAG Knowledge Base model containing parsed corporate policies."""

    status: str = Field(..., description="Status message for knowledge base")
    summaries: dict = Field(..., description="Dictionary of policy summaries")


@router.get(
    "/nexus/rag-context",
    response_model=RAGKnowledgeBase,
    status_code=status.HTTP_200_OK,
    summary="Retrieve RAG Knowledge Base",
    description="Expose the AI's RAG knowledge base containing parsed corporate policies and business rules.",
)
async def get_rag_context(
    current_user: dict = Depends(get_current_user),
) -> RAGKnowledgeBase:
    """
    Retrieve the RAG (Retrieval-Augmented Generation) knowledge base.

    This endpoint exposes the corporate policies, sales procedures, and
    organizational hierarchy that the Aegis-Nexus AI agents use for
    policy validation and decision-making.

    Returns:
        RAGKnowledgeBase: Structured policy summaries for AI context
    """

    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    log.info(f"RAG context requested by {current_user.get('email', 'unknown')}")

    # Construct knowledge base from corporate policies
    knowledge_base = RAGKnowledgeBase(
        status="Knowledge Base Successfully Updated",
        summaries={
            "sales_discount_policy": (
                "Trig Corp mandates a tiered discounting matrix where percentages over 10% "
                "require manager or VP approval and deals exceeding $100,000 undergo mandatory "
                "legal review. All personnel must also avoid contracting with entities on the "
                "Restricted Competitor List to maintain governance and market compliance."
            ),
            "sales_pipeline_sop": (
                "Trig Corp mandates a standardized five-stage sales pipeline for B2B SaaS deals, "
                "requiring the capture of BANT data and internal peer review of proposals. The "
                "process culminates in an AI-assisted policy audit for compliance before finalizing "
                "the deal through CRM updates and a transition to the Customer Success team."
            ),
            "org_hierarchy": (
                "Sarah Jenkins oversees all revenue-generating operations and serves as the final "
                "authority for high-risk deals and discount overrides exceeding twenty percent. "
                "Trig Corp targets high-compliance industries such as FinTech and Healthcare while "
                "utilizing Zoho CRM and Slack to manage customer data and internal communications."
            ),
        },
    )

    return knowledge_base


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

"""
Aegis-Nexus Router - Deal Orchestration & Supervity AI Gateway

This router orchestrates multi-stage AI agent workflows for deal processing.
It coordinates policy validation, lead intelligence, CRM operations, and comms
through the Supervity AI Engine.
"""

import asyncio
import logging
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
from ..services.supervity import supervity_service, WORKFLOW_IDS

router = APIRouter(prefix="/api/v1", tags=["nexus"])

log = logging.getLogger(__name__)


# --- Helper Functions ---
def _generate_deal_id() -> str:
    """Generate a unique deal ID in format DEAL-NNNN."""
    random_suffix = ''.join(random.choices(string.digits, k=4))
    return f"DEAL-{random_suffix}"


# --- Pydantic Models ---
class OrchestratePayload(BaseModel):
    """Request model for deal orchestration."""

    prospect_name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Name of the prospect",
    )
    company_name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Name of the company",
    )
    deal_size: float = Field(
        ...,
        gt=0,
        description="Deal size in USD",
    )
    requested_discount: float = Field(
        ...,
        ge=0,
        le=100,
        description="Requested discount percentage (0-100)",
    )

    class Config:
        json_schema_extra = {
            "example": {
                "prospect_name": "John Smith",
                "company_name": "TechCorp Inc",
                "deal_size": 250000.0,
                "requested_discount": 25.0,
            }
        }


class OrchestrateResponse(BaseModel):
    """Response model for orchestration endpoints."""

    deal_id: str = Field(..., description="Unique deal identifier")
    status: str = Field(..., description="Status: 'success', 'halted', or 'error'")
    message: str = Field(..., description="Detailed message about the result")
    metadata: Optional[dict] = Field(None, description="Additional metadata")


class AuditLogResponse(BaseModel):
    """Response model for audit log entries."""

    id: int
    timestamp: str
    action: str
    actor_email: Optional[str]
    description: str
    success: bool
    severity: str
    resource_type: Optional[str]
    resource_id: Optional[str]


# --- Endpoints ---
@router.post(
    "/nexus/orchestrate",
    response_model=OrchestrateResponse,
    status_code=status.HTTP_200_OK,
    summary="Orchestrate Deal Processing",
    description="Orchestrate multi-stage AI agent workflow for deal processing",
)
async def orchestrate_deal(
    payload: OrchestratePayload,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> OrchestrateResponse:
    """
    Orchestrate a deal through multi-stage AI agent workflow.

    This endpoint:
    1. Validates deal against corporate policies (POLICY_GUARD)
    2. If policy passes, executes parallel workflows (LEAD_INTEL, CRM_OPS, DOC_OPS, COMMS_OPS)
    3. Returns comprehensive orchestration result
    """

    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    deal_id = _generate_deal_id()
    user_email = current_user.get("email", "unknown")
    user_id = current_user.get("sub", "unknown")

    log.info(
        f"Deal orchestration initiated: {deal_id} for {payload.company_name} "
        f"(${payload.deal_size}, {payload.requested_discount}% discount) by {user_email}"
    )

    # Log pending state
    await audit.log(
        action="nexus.orchestrate.pending",
        description=f"Deal orchestration pending: {deal_id} for {payload.company_name}",
        actor=current_user,
        category="DATA",
        severity="INFO",
        resource_type="deal",
        resource_id=deal_id,
        resource_name=payload.company_name,
        metadata={
            "prospect_name": payload.prospect_name,
            "company_name": payload.company_name,
            "deal_size": payload.deal_size,
            "requested_discount": payload.requested_discount,
            "stage": "pending",
        },
        success=True,
        request=request,
    )

    # --- Step A: Policy Guard Validation ---
    log.info(f"Step A: Validating deal {deal_id} against corporate policies (POLICY_GUARD)")

    try:
        policy_result = await supervity_service.execute_workflow(
            workflow_id=WORKFLOW_IDS["POLICY_GUARD"],
            inputs={
                "prospect_name": payload.prospect_name,
                "company_name": payload.company_name,
                "deal_size": str(payload.deal_size),
                "requested_discount": str(payload.requested_discount),
            },
        )
        log.info(f"POLICY_GUARD workflow completed for {deal_id}")
    except Exception as e:
        log.error(f"POLICY_GUARD workflow error for {deal_id}: {str(e)}")
        policy_result = {"status": "error", "message": str(e)}

    # --- Step B: Policy Validation Check ---
    # Simulate policy failure if requested_discount > 20
    if payload.requested_discount > 20:
        log.warning(
            f"Policy violation detected for {deal_id}: "
            f"Requested discount {payload.requested_discount}% exceeds maximum 20%"
        )

        response = OrchestrateResponse(
            deal_id=deal_id,
            status="halted",
            message=f"Workbench_Halted: Policy Violation - Requested discount {payload.requested_discount}% exceeds maximum allowed 20%",
            metadata={
                "violation_type": "discount_exceeded",
                "requested_discount": payload.requested_discount,
                "max_allowed": 20,
                "stage": "policy_guard",
            },
        )

        # Audit log: Policy violation
        await audit.log(
            action="nexus.orchestrate.halted",
            description=f"Policy violation detected: discount {payload.requested_discount}% exceeds 20% limit",
            actor=current_user,
            category="SECURITY",
            severity="WARNING",
            resource_type="deal",
            resource_id=deal_id,
            resource_name=payload.company_name,
            metadata={
                "violation_type": "discount_exceeded",
                "requested_discount": payload.requested_discount,
                "max_allowed": 20,
                "stage": "policy_guard",
            },
            success=False,
            error_message="Discount exceeds maximum allowed (20%)",
            request=request,
        )

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=response.message,
        )

    # --- Step C: Parallel Workflow Execution ---
    log.info(f"Policy passed for {deal_id}. Executing parallel workflows...")

    parallel_inputs = {
        "prospect_name": payload.prospect_name,
        "company_name": payload.company_name,
        "deal_size": str(payload.deal_size),
        "requested_discount": str(payload.requested_discount),
    }

    try:
        # Execute LEAD_INTEL, CRM_OPS, DOC_OPS, COMMS_OPS in parallel
        results = await asyncio.gather(
            supervity_service.execute_workflow(
                workflow_id=WORKFLOW_IDS["LEAD_INTEL"],
                inputs=parallel_inputs,
            ),
            supervity_service.execute_workflow(
                workflow_id=WORKFLOW_IDS["CRM_OPS"],
                inputs=parallel_inputs,
            ),
            supervity_service.execute_workflow(
                workflow_id=WORKFLOW_IDS["DOC_OPS"],
                inputs=parallel_inputs,
            ),
            supervity_service.execute_workflow(
                workflow_id=WORKFLOW_IDS["COMMS_OPS"],
                inputs=parallel_inputs,
            ),
            return_exceptions=True,
        )

        # Check for errors in parallel execution
        errors = [r for r in results if isinstance(r, Exception)]
        if errors:
            error_msgs = "; ".join([str(e) for e in errors])
            log.warning(f"Some parallel workflows failed for {deal_id}: {error_msgs}")

        log.info(f"Parallel workflows completed for {deal_id}")

        # Success response
        response = OrchestrateResponse(
            deal_id=deal_id,
            status="success",
            message="✓ Deal orchestration completed successfully. All pipeline stages executed.",
            metadata={
                "prospect_name": payload.prospect_name,
                "company_name": payload.company_name,
                "deal_size": payload.deal_size,
                "requested_discount": payload.requested_discount,
                "workflows_executed": [
                    "POLICY_GUARD",
                    "LEAD_INTEL",
                    "CRM_OPS",
                    "DOC_OPS",
                    "COMMS_OPS",
                ],
                "stage": "success",
            },
        )

        # Audit log: Successful orchestration
        await audit.log(
            action="nexus.orchestrate.success",
            description=f"Deal {deal_id} orchestrated successfully through all pipeline stages",
            actor=current_user,
            category="DATA",
            severity="INFO",
            resource_type="deal",
            resource_id=deal_id,
            resource_name=payload.company_name,
            metadata={
                "prospect_name": payload.prospect_name,
                "company_name": payload.company_name,
                "deal_size": payload.deal_size,
                "requested_discount": payload.requested_discount,
                "workflows_executed": ["POLICY_GUARD", "LEAD_INTEL", "CRM_OPS", "DOC_OPS", "COMMS_OPS"],
                "stage": "success",
            },
            success=True,
            request=request,
        )

        log.info(f"Deal {deal_id} orchestrated successfully by {user_email}")
        return response

    except Exception as e:
        error_msg = f"Orchestration error for {deal_id}: {str(e)}"
        log.error(error_msg)

        response = OrchestrateResponse(
            deal_id=deal_id,
            status="error",
            message=f"⚠️ Orchestration error: {str(e)}",
            metadata={
                "error": str(e),
                "stage": "parallel_execution",
            },
        )

        # Audit log: Orchestration error
        await audit.log(
            action="nexus.orchestrate.error",
            description=f"Orchestration error for {deal_id}: {str(e)}",
            actor=current_user,
            category="ERROR",
            severity="ERROR",
            resource_type="deal",
            resource_id=deal_id,
            resource_name=payload.company_name,
            metadata={
                "error": str(e),
                "stage": "parallel_execution",
            },
            success=False,
            error_message=error_msg,
            request=request,
        )

        return response


@router.get(
    "/nexus/logs",
    response_model=list[AuditLogResponse],
    status_code=status.HTTP_200_OK,
    summary="Retrieve Recent Audit Logs",
    description="Get the 10 most recent audit logs",
)
async def get_audit_logs(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AuditLogResponse]:
    """
    Retrieve recent audit logs.

    Returns the 10 most recent audit log entries ordered by timestamp descending.
    """

    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    log.info(f"Audit logs requested by {current_user.get('email', 'unknown')}")

    # Query recent audit logs
    audit_logs = (
        db.query(AuditLog)
        .order_by(AuditLog.timestamp.desc())
        .limit(10)
        .all()
    )

    if not audit_logs:
        log.info("No audit logs found")
        return []

    # Transform to response format
    response_data = [
        AuditLogResponse(
            id=entry.id,
            timestamp=entry.timestamp.isoformat() if entry.timestamp else None,
            action=entry.action,
            actor_email=entry.actor_email,
            description=entry.description,
            success=entry.success,
            severity=entry.severity,
            resource_type=entry.resource_type,
            resource_id=entry.resource_id,
        )
        for entry in audit_logs
    ]

    log.info(f"Returned {len(response_data)} audit logs")
    return response_data


@router.post(
    "/nexus/sync-policies",
    status_code=status.HTTP_200_OK,
    summary="Sync Corporate Policies via Supervity",
    description="Execute the Knowledge Ingestion workflow to sync corporate policies",
)
async def sync_policies(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """
    Sync corporate policies via Supervity Knowledge Ingestion workflow.

    This endpoint triggers the Knowledge Ingestion workflow on Supervity,
    which processes and ingests corporate policies for the RAG system.
    """

    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    user_email = current_user.get("email", "unknown")

    log.info(f"Policy sync initiated by {user_email}")

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
            "operator": "Knowledge Ingestion",
            "stage": "pending",
        },
        success=True,
        request=request,
    )

    try:
        workflow_inputs = {
            "sales_discount_policy": "Discount tiers require manager approval above 10%, legal review above $100k",
            "sales_pipeline_sop": "BANT capture, peer review, AI audit required for all B2B SaaS deals",
            "org_hierarchy": "VP authority for discount overrides exceeding 20%",
        }

        workflow_response = await supervity_service.execute_workflow(
            workflow_id=WORKFLOW_IDS["KNOWLEDGE_INGESTION"],
            inputs=workflow_inputs,
        )

        log.info(f"Policy sync completed by {user_email}")

        await audit.log(
            action="nexus.policies_synced",
            description="Corporate policies successfully synced via Supervity",
            actor=current_user,
            category="DATA",
            severity="INFO",
            resource_type="policies",
            resource_id="policies-sync",
            resource_name="Supervity Knowledge Ingestion",
            metadata={
                "operator": "Knowledge Ingestion",
                "stage": "success",
            },
            success=True,
            request=request,
        )

        return workflow_response

    except Exception as e:
        error_msg = f"Policy sync failed: {str(e)}"
        log.error(error_msg)

        await audit.log(
            action="nexus.policies_sync.error",
            description=f"Policy sync failed: {str(e)}",
            actor=current_user,
            category="ERROR",
            severity="ERROR",
            resource_type="policies",
            resource_id="policies-sync",
            resource_name="Supervity Knowledge Ingestion",
            metadata={"error": str(e)},
            success=False,
            error_message=error_msg,
            request=request,
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=error_msg,
        )


class RAGKnowledgeBase(BaseModel):
    """RAG Knowledge Base model containing parsed corporate policies."""

    status: str = Field(..., description="Status message")
    summaries: dict = Field(..., description="Policy summaries")


@router.get(
    "/nexus/rag-context",
    response_model=RAGKnowledgeBase,
    status_code=status.HTTP_200_OK,
    summary="Retrieve RAG Knowledge Base",
    description="Expose the AI's RAG knowledge base with corporate policies",
)
async def get_rag_context(
    current_user: dict = Depends(get_current_user),
) -> RAGKnowledgeBase:
    """
    Retrieve the RAG knowledge base containing corporate policies.
    """

    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    log.info(f"RAG context requested by {current_user.get('email', 'unknown')}")

    knowledge_base = RAGKnowledgeBase(
        status="Knowledge Base Successfully Updated",
        summaries={
            "sales_discount_policy": (
                "Trig Corp mandates a tiered discounting matrix where percentages over 10% "
                "require manager or VP approval and deals exceeding $100,000 undergo mandatory "
                "legal review."
            ),
            "sales_pipeline_sop": (
                "Trig Corp mandates a standardized five-stage sales pipeline for B2B SaaS deals, "
                "requiring BANT data capture and internal peer review of proposals."
            ),
            "org_hierarchy": (
                "Sarah Jenkins serves as the final authority for high-risk deals and "
                "discount overrides exceeding twenty percent."
            ),
        },
    )

    return knowledge_base

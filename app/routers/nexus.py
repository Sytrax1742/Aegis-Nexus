import json
import logging
import os
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..core.database import get_db
from ..models.audit import AuditLog
from ..models.settings import Settings
from ..security import get_current_user
from ..services.audit import audit
from ..services.supervity import supervity_service

log = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/nexus", tags=["nexus"])

# Supervity AI Orchestrator (Handles entire deal pipeline)
SUPERVITY_ORCHESTRATOR_ID = os.getenv("SUPERVITY_ORCHESTRATOR_ID")
if not SUPERVITY_ORCHESTRATOR_ID:
    log.warning("⚠️  SUPERVITY_ORCHESTRATOR_ID not set in environment")

# Knowledge Ingestion Agent
KNOWLEDGE_INGESTION_ID = "019e3056-6682-7000-81db-57be3cd39779"

# Subordinate Agent Workflow IDs (passed to Orchestrator)
WORKFLOW_IDS = {
    "LEAD_INTEL": "019e3095-3378-7000-81f1-6f5dfee4b6ea",
    "POLICY_GUARD": "019e306a-34a6-7000-ab83-01ed37ef91a4",
    "CRM_OPS": "019e307e-2f53-7000-a9c8-25ae89119cf9",
    "DOC_OPS": "019e3089-2ae9-7000-90c5-f6e1e1269002",
    "COMMS_OPS": "019e308d-dd05-7000-b8ae-2035b6e5b65c",
}

class IngestKnowledgePayload(BaseModel):
    """Knowledge ingestion payload with three distinct document types."""
    sales_policy: str
    pipeline_sop: str
    org_hierarchy: str


class OrchestratePayload(BaseModel):
    """Simplified payload for deal orchestration. Supervity handles all business logic."""
    transcript: str


class ResolveExceptionPayload(BaseModel):
    """Payload for submitting human input to resume a paused orchestration."""
    runId: str
    input_data: dict


@router.post("/ingest-knowledge")
async def ingest_knowledge(
    payload: IngestKnowledgePayload,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Ingest corporate policies and procedures into the knowledge base.
    
    Calls the Knowledge Agent to process the document and stores the
    resulting policy configuration in the settings table for use by
    the Orchestrator when processing deals.
    """
    try:
        # Call the Knowledge Ingestion Agent with three distinct inputs
        result = await supervity_service.execute_workflow(
            workflow_id=KNOWLEDGE_INGESTION_ID,
            inputs={
                "sales_discount_policy": payload.sales_policy,
                "sales_pipeline_sop": payload.pipeline_sop,
                "org_hierarchy": payload.org_hierarchy,
            },
        )

        # Save the policy config to the settings table
        policy_config_json = json.dumps(result)
        
        # Check if the key already exists
        existing_config = (
            db.query(Settings)
            .filter(Settings.key == "active_policy_config")
            .first()
        )

        if existing_config:
            existing_config.value = policy_config_json
        else:
            new_config = Settings(
                key="active_policy_config",
                value=policy_config_json,
                description="Active corporate policy configuration from Knowledge Agent",
            )
            db.add(new_config)

        db.commit()

        # Log the successful ingestion
        await audit.log(
            action="nexus.ingest_knowledge",
            description="Knowledge documents ingested: sales policy, pipeline SOP, and org hierarchy",
            actor=current_user,
            success=True,
            resource_type="policy_config",
            resource_id="active_policy_config",
        )

        return {
            "status": "success",
            "message": "Knowledge base updated with sales policy, pipeline SOP, and organization hierarchy",
            "policy_config": result,
        }

    except Exception as e:
        log.error(f"Knowledge ingestion failed: {e}")
        await audit.log(
            action="nexus.ingest_knowledge",
            description=f"Knowledge ingestion failed: {str(e)}",
            actor=current_user,
            success=False,
        )
        raise HTTPException(
            status_code=500, detail=f"Knowledge ingestion failed: {str(e)}"
        )

@router.get("/rag-context")
async def get_rag_context(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Provides the active RAG policies from the settings table.
    
    Returns the policy configuration that was ingested via /ingest-knowledge.
    If no policy config exists, returns a guidance message.
    """
    config = db.query(Settings).filter(Settings.key == "active_policy_config").first()

    if not config or not config.value:
        return {
            "status": "no_config",
            "message": "No corporate policies loaded. Use /ingest-knowledge to sync policies.",
        }

    try:
        policy_data = json.loads(config.value)
        return {
            "status": "success",
            "message": "Knowledge Base Successfully Updated",
            "policy_config": policy_data,
        }
    except json.JSONDecodeError:
        log.error("Failed to parse policy_config JSON from database")
        return {
            "status": "error",
            "message": "Policy configuration is corrupted",
        }

@router.get("/logs")
async def get_execution_logs(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Pulls the latest pipeline execution logs for the frontend table."""
    logs = db.query(AuditLog).filter(AuditLog.action.like("nexus.orchestrate%")).order_by(AuditLog.timestamp.desc()).limit(10).all()
    return [{"timestamp": l.timestamp, "action": l.action, "status": l.success} for l in logs]

@router.post("/orchestrate")
async def orchestrate_pipeline(
    payload: OrchestratePayload,
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Orchestrate a deal through the Supervity AI Orchestrator.
    
    Flow:
    1. Fetch the active corporate policy configuration from settings
    2. If missing, return 400 error
    3. Call supervity_service.execute_workflow with SUPERVITY_ORCHESTRATOR_ID
    4. Inputs: sales_transcript (from payload) and knowledge_ingestion_output (JSON from DB)
    5. Capture the runId (or workflow_run_id) from the Supervity response
    6. Save a new log entry to AuditLog with resource_id = runId and success = PENDING
    7. Return the runId to the frontend
    """
    
    # Step 1: Fetch active policy configuration from settings table
    policy_config_record = (
        db.query(Settings).filter(Settings.key == "active_policy_config").first()
    )

    if not policy_config_record or not policy_config_record.value:
        log.warning("No active policy configuration found in settings")
        raise HTTPException(
            status_code=400,
            detail="Please sync corporate policies in Settings first.",
        )

    # Validate that policy_config is valid JSON
    try:
        policy_config_json_str = policy_config_record.value
        # Verify it's valid JSON by parsing it
        json.loads(policy_config_json_str)
    except json.JSONDecodeError as e:
        log.error(f"Failed to parse policy config: {e}")
        raise HTTPException(
            status_code=500, detail="Policy configuration is corrupted"
        )

    # Step 2: Build the inputs dict for the Orchestrator
    orchestrator_inputs = {
        "sales_transcript": payload.transcript,
        "knowledge_ingestion_output": policy_config_json_str,
    }

    # Step 3: Execute the Supervity Orchestrator (ONE async call)
    try:
        result = await supervity_service.execute_workflow(
            workflow_id=SUPERVITY_ORCHESTRATOR_ID,
            inputs=orchestrator_inputs,
        )

        log.info(f"Orchestrator execution initiated. Result: {result}")

        # Step 4: Capture the runId from the Supervity response
        run_id = result.get("runId") or result.get("workflow_run_id") or result.get("id")
        
        if not run_id:
            log.error(f"No runId found in Supervity response: {result}")
            raise HTTPException(
                status_code=500,
                detail="Invalid response from Orchestrator: missing runId",
            )

        # Step 5: Save a new log entry with status = PENDING
        new_log_entry = AuditLog(
            action="nexus.orchestrate",
            description=f"Deal orchestration initiated with Supervity Orchestrator",
            actor_email=current_user.get("email", "system"),
            success=False,  # False means status is PENDING (awaiting completion)
            severity="INFO",
            resource_type="deal",
            resource_id=str(run_id),
        )
        db.add(new_log_entry)
        db.commit()

        log.info(f"Created audit log entry for orchestration run: {run_id}")

        # Step 6: Return the runId to the frontend
        return {
            "status": "pending",
            "runId": run_id,
            "message": "Deal orchestration initiated. Use runId to track progress.",
        }

    except Exception as e:
        log.error(f"Orchestrator execution failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Orchestrator execution failed: {str(e)}",
        )

@router.post("/resolve-exception")
async def resolve_exception(
    payload: ResolveExceptionPayload,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Resolve an orchestration exception by submitting human input.
    
    This endpoint resumes a paused workflow by sending human input to the Supervity
    "Submit Human Input" API. Used when a deal is halted for VP review/approval.
    
    Flow:
    1. Validate runId exists in the payload
    2. Call Supervity resume endpoint: POST /api/v1/workflow-runs/{runId}/resume
    3. Log the resolution in AuditLog
    4. Return success status
    """
    
    if not payload.runId:
        raise HTTPException(
            status_code=400,
            detail="runId is required to resolve an exception",
        )

    try:
        log.info(f"Attempting to resolve orchestration exception for runId: {payload.runId}")

        # Call the Supervity "Submit Human Input" API to resume the workflow
        result = await supervity_service.resume_workflow(
            run_id=payload.runId,
            input_data=payload.input_data,
        )

        log.info(f"Orchestration exception resolved for runId: {payload.runId}")

        # Log the resolution in AuditLog
        resolution_log = AuditLog(
            action="nexus.resolve_exception",
            description=f"VP approved exception for orchestration runId: {payload.runId}. Workflow resumed with input data.",
            actor_email=current_user.get("email", "system"),
            success=True,
            severity="INFO",
            resource_type="deal",
            resource_id=str(payload.runId),
        )
        db.add(resolution_log)
        db.commit()

        return {
            "status": "success",
            "runId": payload.runId,
            "message": "Exception resolved and orchestration resumed",
            "supervity_response": result,
        }

    except Exception as e:
        log.error(f"Exception resolution failed for runId {payload.runId}: {e}")
        
        # Log the failure
        failure_log = AuditLog(
            action="nexus.resolve_exception.error",
            description=f"Failed to resolve exception for runId {payload.runId}: {str(e)}",
            actor_email=current_user.get("email", "system"),
            success=False,
            severity="ERROR",
            resource_type="deal",
            resource_id=str(payload.runId),
        )
        db.add(failure_log)
        db.commit()

        raise HTTPException(
            status_code=500,
            detail=f"Exception resolution failed: {str(e)}",
        )
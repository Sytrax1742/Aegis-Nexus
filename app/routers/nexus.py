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
    2. Validate the Orchestrator ID is configured
    3. Build the inputs dict with:
       - sales_transcript: Raw call transcript
       - knowledge_ingestion_output: Policy config JSON string
       - Workflow IDs for all subordinate agents (Policy Guard, CRM Ops, etc.)
    4. Make ONE async call to the Supervity Orchestrator
    5. Log the entire orchestration event for audit compliance
    
    Returns orchestration result (approved, halted, or error).
    """
    
    # Step 1: Validate Orchestrator ID is configured
    if not SUPERVITY_ORCHESTRATOR_ID:
        log.error("SUPERVITY_ORCHESTRATOR_ID not configured")
        await audit.log(
            action="nexus.orchestrate.error",
            description="Orchestrator not configured in environment",
            actor=current_user,
            success=False,
        )
        raise HTTPException(
            status_code=500,
            detail="System misconfiguration: Orchestrator not available",
        )

    # Step 2: Fetch active policy configuration from settings table
    policy_config_record = (
        db.query(Settings).filter(Settings.key == "active_policy_config").first()
    )

    if not policy_config_record or not policy_config_record.value:
        log.warning("No active policy configuration found in settings")
        await audit.log(
            action="nexus.orchestrate.error",
            description="No corporate policy configuration found in settings",
            actor=current_user,
            success=False,
            resource_type="deal",
        )
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
        await audit.log(
            action="nexus.orchestrate.error",
            description=f"Policy configuration JSON is malformed: {str(e)}",
            actor=current_user,
            success=False,
        )
        raise HTTPException(
            status_code=500, detail="Policy configuration is corrupted"
        )

    # Log the start of orchestration
    await audit.log(
        action="nexus.orchestrate.started",
        description="Initiated deal orchestration with Supervity Orchestrator",
        actor=current_user,
        success=True,
        resource_type="deal",
    )

    # Step 3: Build the inputs dict for the Orchestrator with the new contract
    orchestrator_inputs = {
        "sales_transcript": payload.transcript,
        "knowledge_ingestion_output": policy_config_json_str,
        "policyguard_skill_id": WORKFLOW_IDS["POLICY_GUARD"],
        "comms_ops_skill_id": WORKFLOW_IDS["COMMS_OPS"],
        "crm_ops_skill_id": WORKFLOW_IDS["CRM_OPS"],
        "doc_ops_skill_id": WORKFLOW_IDS["DOC_OPS"],
        "leadintel_ops_skill_id": WORKFLOW_IDS["LEAD_INTEL"],
    }

    # Step 4: Execute the Supervity Orchestrator (ONE async call)
    try:
        result = await supervity_service.execute_workflow(
            workflow_id=SUPERVITY_ORCHESTRATOR_ID,
            inputs=orchestrator_inputs,
        )

        log.info(f"Orchestrator execution completed. Result: {result}")

        # Step 5: Log the orchestration event with full result
        outcome_status = result.get("status", "unknown")

        if outcome_status == "workbench_halt" or outcome_status == "exception":
            # Deal escalated to workbench due to policy violation or other exception
            await audit.log(
                action="nexus.orchestrate.workbench_halt",
                description=f"Deal escalated to Supervity Workbench: {result.get('reason', 'Policy violation detected')}",
                actor=current_user,
                success=False,
                resource_type="deal",
                extra_data=result,
            )
        elif outcome_status == "success" or outcome_status == "approved":
            # Deal approved and forwarded through pipeline
            await audit.log(
                action="nexus.orchestrate.success",
                description="Deal orchestration completed successfully. Forwarded to CRM and document generation.",
                actor=current_user,
                success=True,
                resource_type="deal",
                extra_data=result,
            )
        else:
            # Unknown or other status
            await audit.log(
                action="nexus.orchestrate.completed",
                description=f"Deal orchestration completed with status: {outcome_status}",
                actor=current_user,
                success=True,
                resource_type="deal",
                extra_data=result,
            )

        return {
            "status": "success",
            "orchestrator_result": result,
        }

    except Exception as e:
        log.error(f"Orchestrator execution failed: {e}")
        await audit.log(
            action="nexus.orchestrate.error",
            description=f"Orchestrator execution failed: {str(e)}",
            actor=current_user,
            success=False,
            resource_type="deal",
        )
        raise HTTPException(
            status_code=500,
            detail=f"Orchestrator execution failed: {str(e)}",
        )
import json
import logging
import os
from fastapi import APIRouter, Depends, HTTPException, Request, status, File, UploadFile
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
    "KNOWLEDGE_INGESTION": "019e3056-6682-7000-81db-57be3cd39779",
    "LEAD_INTEL": "019e3095-3378-7000-81f1-6f5dfee4b6ea",
    "POLICY_GUARD": "019e306a-34a6-7000-ab83-01ed37ef91a4",
    "CRM_OPS": "019e307e-2f53-7000-a9c8-25ae89119cf9",
    "DOC_OPS": "019e3089-2ae9-7000-90c5-f6e1e1269002",
    "COMMS_OPS": "019e308d-dd05-7000-b8ae-2035b6e5b65c",
    "NEXUS_ORCHESTRATOR": SUPERVITY_ORCHESTRATOR_ID,
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


def _resolve_workflow_id(workflow_key: str | None) -> str | None:
    if not workflow_key:
        return None

    workflow_key_upper = workflow_key.strip().upper()
    if workflow_key_upper in WORKFLOW_IDS and WORKFLOW_IDS[workflow_key_upper]:
        return WORKFLOW_IDS[workflow_key_upper]

    for key, value in WORKFLOW_IDS.items():
        if value and value == workflow_key:
            return value

    return workflow_key


@router.post("/ingest-knowledge")
async def ingest_knowledge(
    sales_policy_file: UploadFile = File(...),
    pipeline_sop_file: UploadFile = File(...),
    org_hierarchy_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Ingests the Trinity of Knowledge and caches the structured brain."""
    try:
        # Construct the binary courier payload
        files = {
            "inputs[sales_discount_policy]": (sales_policy_file.filename, sales_policy_file.file, sales_policy_file.content_type),
            "inputs[sales_pipeline_sop]": (pipeline_sop_file.filename, pipeline_sop_file.file, pipeline_sop_file.content_type),
            "inputs[org_hierarchy]": (org_hierarchy_file.filename, org_hierarchy_file.file, org_hierarchy_file.content_type)
        }

        # Fire the Knowledge Agent
        raw_result = await supervity_service.execute_workflow(
            workflow_id=WORKFLOW_IDS["KNOWLEDGE_INGESTION"],
            files=files
        )

        # --- RESPONSE NORMALIZATION ---
        # Supervity returns a dictionary. We want to ensure we save the core JSON.
        import json
        policy_json_str = json.dumps(raw_result)

        # Save to SQLite 'settings' table
        existing_setting = db.query(Settings).filter(Settings.key == "active_policy_config").first()
        if existing_setting:
            existing_setting.value = policy_json_str
        else:
            new_setting = Settings(key="active_policy_config", value=policy_json_str)
            db.add(new_setting)

        db.commit()

        await audit.log(action="nexus.knowledge_synced", description="Corporate Trinity synced to local cache.", actor=current_user, success=True)
        
        return {"status": "success", "message": "Aegis Brain Sync Complete", "data": raw_result}

    except Exception as e:
        log.error(f"Sync Logic Failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Sync Failed: {str(e)}")


@router.post("/workflows/execute")
async def execute_workflow_proxy(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Generic multipart proxy to Supervity workflows.

    Accepts the documented workflowId plus any inputs[...] fields and file fields,
    then forwards them through the backend so the browser never needs the Supervity token.
    """
    form = await request.form()

    workflow_id = _resolve_workflow_id(str(form.get("workflowId") or form.get("operatorKey") or ""))
    if not workflow_id:
        raise HTTPException(status_code=400, detail="workflowId or operatorKey is required")

    inputs: dict[str, str] = {}
    files: dict[str, tuple[str, object, str | None]] = {}

    for key, value in form.multi_items():
        if key in {"workflowId", "operatorKey"}:
            continue

        if hasattr(value, "filename") and hasattr(value, "file"):
            files[key] = (value.filename, value.file, getattr(value, "content_type", None))
            continue

        field_key = key
        if key.startswith("inputs[") and key.endswith("]"):
            field_key = key[len("inputs[") : -1]
        inputs[field_key] = str(value)

    try:
        result = await supervity_service.execute_workflow(
            workflow_id=workflow_id,
            inputs=inputs or None,
            files=files or None,
        )

        return {
            "status": "success",
            "workflowId": workflow_id,
            "data": result,
        }
    except Exception as e:
        log.error(f"Workflow proxy failed for {workflow_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Workflow execution failed: {str(e)}")

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
    orchestrator_id = SUPERVITY_ORCHESTRATOR_ID or WORKFLOW_IDS.get("LEAD_INTEL")
    try:
        result = await supervity_service.execute_workflow(
            workflow_id=orchestrator_id,
            inputs=orchestrator_inputs,
        )

        log.info(f"Orchestrator execution returned. Result: {result}")

        # Step 4: If the orchestrator indicates it is WAITING_FOR_INPUT, persist a pending audit log and return to UI
        if isinstance(result, dict) and result.get("status") == "WAITING_FOR_INPUT":
            run_id = result.get("runId")
            new_log_entry = AuditLog(
                action="nexus.orchestrate",
                description=f"Deal orchestration awaiting human input",
                actor_email=current_user.get("email", "system"),
                success=False,  # pending
                severity="WARN",
                resource_type="deal",
                resource_id=str(run_id),
            )
            db.add(new_log_entry)
            db.commit()

            return {
                "status": "WAITING_FOR_INPUT",
                "runId": run_id,
                "message": "Orchestrator paused and requires human input",
            }

        # Otherwise, treat as completed/approved and proceed to execution layer
        run_id = (
            result.get("runId")
            or result.get("workflow_run_id")
            or result.get("id")
            or None
        )

        if not run_id:
            log.warning("No runId found in orchestrator response; generating fallback id")
            run_id = f"local-{int(__import__('time').time())}"

        # Persist initial orchestration entry as succeeded (we will update if any downstream fails)
        orchestration_log = AuditLog(
            action="nexus.orchestrate",
            description=f"Deal orchestration completed (orchestrator returned).",
            actor_email=current_user.get("email", "system"),
            success=True,
            severity="INFO",
            resource_type="deal",
            resource_id=str(run_id),
        )
        db.add(orchestration_log)
        db.commit()

        # Step 5: Fire Execution Layer agents (CRM, DOC, COMMS) — best-effort, log each outcome
        execution_results = {}
        execution_workflows = [
            ("CRM_OPS", "nexus.execute.crm", "Creates Deal and Lead in Zoho CRM"),
            ("DOC_OPS", "nexus.execute.doc", "Generates proposal in OneDrive and returns share link"),
            ("COMMS_OPS", "nexus.execute.comms", "Sends Slack notification with links"),
        ]

        for key, action_name, desc in execution_workflows:
            try:
                wf_id = WORKFLOW_IDS.get(key)
                if not wf_id:
                    raise RuntimeError(f"Workflow id for {key} missing")

                exec_inputs = {
                    "runId": run_id,
                    "transcript": payload.transcript,
                }

                exec_result = await supervity_service.execute_workflow(
                    workflow_id=wf_id,
                    inputs=exec_inputs,
                )

                execution_results[key] = exec_result

                exec_log = AuditLog(
                    action=action_name,
                    description=desc,
                    actor_email=current_user.get("email", "system"),
                    success=True,
                    severity="INFO",
                    resource_type="deal",
                    resource_id=str(run_id),
                )
                db.add(exec_log)
                db.commit()

            except Exception as e:
                log.error(f"Execution workflow {key} failed for run {run_id}: {e}")
                # Log failure but continue with others
                fail_log = AuditLog(
                    action=f"{action_name}.error",
                    description=f"Execution failed: {str(e)}",
                    actor_email=current_user.get("email", "system"),
                    success=False,
                    severity="ERROR",
                    resource_type="deal",
                    resource_id=str(run_id),
                )
                db.add(fail_log)
                db.commit()
                execution_results[key] = {"error": str(e)}

        # Return combined response including execution outputs so UI can display links/status
        return {
            "status": "success",
            "runId": run_id,
            "orchestrator_response": result,
            "execution_results": execution_results,
            "message": "Pipeline executed and execution layer dispatched",
        }

    except Exception as e:
        log.error(f"Orchestrator execution failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Orchestrator execution failed: {str(e)}",
        )


@router.get("/metrics")
async def get_metrics(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """
    Returns simple ROI-style metrics derived from execution logs.

    - administrative_hours_saved: estimated hours saved by automation
    - margin_protected_pct: estimated margin protected from rogue discounts
    - compliance_rate: percent of orchestrations that completed without halts
    """
    try:
        total_orchestrations = db.query(AuditLog).filter(AuditLog.action == "nexus.orchestrate").count()
        executed_crm = db.query(AuditLog).filter(AuditLog.action == "nexus.execute.crm", AuditLog.success == True).count()
        executed_doc = db.query(AuditLog).filter(AuditLog.action == "nexus.execute.doc", AuditLog.success == True).count()
        executed_comms = db.query(AuditLog).filter(AuditLog.action == "nexus.execute.comms", AuditLog.success == True).count()

        # Simple heuristics for demo metrics
        successful_executions = max(executed_crm, executed_doc, executed_comms)
        administrative_hours_saved = successful_executions * 40  # assume 40 hours saved per successful automation
        margin_protected_pct = round(min(100.0, (successful_executions / max(1, total_orchestrations)) * 15.0), 1)
        compliance_rate = round((1.0 - (db.query(AuditLog).filter(AuditLog.action.like("nexus.orchestrate%"), AuditLog.success == False).count() / max(1, total_orchestrations))) * 100.0, 1) if total_orchestrations > 0 else 100.0

        return {
            "administrative_hours_saved": administrative_hours_saved,
            "margin_protected_pct": margin_protected_pct,
            "compliance_rate": compliance_rate,
            "total_orchestrations": total_orchestrations,
        }
    except Exception as e:
        log.error(f"Failed to compute metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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
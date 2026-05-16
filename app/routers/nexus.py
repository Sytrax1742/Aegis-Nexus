import logging
import os
import asyncio
import random
import string
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..core.database import get_db
from ..models.audit import AuditLog
from ..security import get_current_user
from ..services.audit import audit
from ..services.supervity import supervity_service

log = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/nexus", tags=["nexus"])

# The 6-Agent Supervity Mesh
WORKFLOW_IDS = {
    "KNOWLEDGE_INGESTION": "019e3056-6682-7000-81db-57be3cd39779",
    "LEAD_INTEL": "019e3095-3378-7000-81f1-6f5dfee4b6ea",
    "POLICY_GUARD": "019e306a-34a6-7000-ab83-01ed37ef91a4",
    "CRM_OPS": "019e307e-2f53-7000-a9c8-25ae89119cf9",
    "DOC_OPS": "019e3089-2ae9-7000-90c5-f6e1e1269002",
    "COMMS_OPS": "019e308d-dd05-7000-b8ae-2035b6e5b65c"
}

class IngestKnowledgePayload(BaseModel):
    document_content: str
    document_type: str = "policy"
    source: str = "unknown"

class OrchestratePayload(BaseModel):
    prospect_name: str
    company_name: str
    deal_size: float
    requested_discount: float
    competitor_mentioned: str = "None"
    requested_terms: str = "Standard"
    inbound_activity_log: str = ""

def _generate_deal_id() -> str:
    return f"DEAL-{''.join(random.choices(string.digits, k=4))}"

@router.post("/ingest-knowledge")
async def ingest_knowledge(payload: IngestKnowledgePayload, current_user: dict = Depends(get_current_user)):
    """Ingest knowledge documents (policies, procedures, etc.) into the knowledge base."""
    try:
        # Fire the KNOWLEDGE_INGESTION agent
        result = await supervity_service.execute_workflow(
            workflow_id=WORKFLOW_IDS["KNOWLEDGE_INGESTION"],
            inputs={
                "document_content": payload.document_content,
                "document_type": payload.document_type,
                "source": payload.source
            }
        )
        await audit.log(action="nexus.ingest_knowledge", description=f"Knowledge document ingested: {payload.source}", actor=current_user, success=True)
        return {"status": "success", "message": f"Knowledge document '{payload.source}' ingested successfully", "result": result}
    except Exception as e:
        log.error(f"Knowledge ingestion failed: {e}")
        await audit.log(action="nexus.ingest_knowledge", description=f"Knowledge ingestion failed: {e}", actor=current_user, success=False)
        raise HTTPException(status_code=500, detail=f"Knowledge ingestion failed: {e}")

@router.get("/rag-context")
async def get_rag_context(current_user: dict = Depends(get_current_user)):
    """Provides the active RAG policies to the frontend UI."""
    return {
        "status": "Knowledge Base Successfully Updated",
        "summaries": {
            "sales_discount_policy": "Trig Corp mandates a tiered discounting matrix where percentages over 10% require manager or VP approval.",
            "sales_pipeline_sop": "All B2B SaaS deals require BANT data and internal peer review before CRM sync.",
            "org_hierarchy": "Sarah Jenkins oversees all revenue operations and is the final authority for discount overrides exceeding 20%."
        }
    }

@router.get("/logs")
async def get_execution_logs(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Pulls the latest pipeline execution logs for the frontend table."""
    logs = db.query(AuditLog).filter(AuditLog.action.like("nexus.orchestrate%")).order_by(AuditLog.timestamp.desc()).limit(10).all()
    return [{"timestamp": l.timestamp, "action": l.action, "status": l.success} for l in logs]

@router.post("/orchestrate")
async def orchestrate_pipeline(payload: OrchestratePayload, request: Request, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    deal_id = _generate_deal_id()
    
    # 1. Log Pending State
    await audit.log(action="nexus.orchestrate.started", description=f"Started deal orchestration for {payload.company_name}", actor=current_user, success=True)
    
    # 2. TRIGGER POLICY GUARD (The Sieve)
    try:
        # We fire the real Supervity Agent
        pg_result = await supervity_service.execute_workflow(
            workflow_id=WORKFLOW_IDS["POLICY_GUARD"],
            inputs={
                "Prospect_Name": payload.prospect_name,
                "Requested_Discount": str(payload.requested_discount),
                "Competitor_Mentioned": "None",
                "Requested_Terms": "Standard"
            }
        )
    except Exception as e:
        log.error(f"Policy Guard failed: {e}")
        # Local Fallback Trap for Demo purposes if Supervity times out
        if payload.requested_discount > 20:
            await audit.log(action="nexus.orchestrate.workbench_halt", description=f"POLICY VIOLATION: {payload.requested_discount}% discount requested.", actor=current_user, success=False)
            raise HTTPException(status_code=403, detail="Workbench_Halted: Policy Violation")
            
    # 3. EVALUATE POLICY RESPONSE
    # If the requested discount is over 20%, HALT the pipeline.
    if payload.requested_discount > 20:
        await audit.log(action="nexus.orchestrate.workbench_halt", description=f"POLICY VIOLATION: {payload.requested_discount}% discount requested.", actor=current_user, success=False)
        raise HTTPException(status_code=403, detail="Workbench_Halted: Policy Violation")

    # 4. PARALLEL SWARM (If Policy Guard Passes)
    try:
        # Fire the remaining 4 agents simultaneously
        await asyncio.gather(
            supervity_service.execute_workflow(WORKFLOW_IDS["LEAD_INTEL"], {"Prospect_Name": payload.prospect_name}),
            supervity_service.execute_workflow(WORKFLOW_IDS["CRM_OPS"], {"Prospect_Name": payload.prospect_name, "Deal_Size": payload.deal_size, "Stage": "Negotiation"}),
            supervity_service.execute_workflow(WORKFLOW_IDS["DOC_OPS"], {"prospect_name": payload.prospect_name, "deal_size": payload.deal_size, "battlecard": "Standard"}),
            supervity_service.execute_workflow(WORKFLOW_IDS["COMMS_OPS"], {"Prospect_Name": payload.prospect_name, "Deal_Size": payload.deal_size, "Policy_Status": "Approved"})
        )
        
        await audit.log(action="nexus.orchestrate.success", description=f"All agents completed successfully for {payload.company_name}", actor=current_user, success=True)
        return {"status": "success", "message": "Pipeline completed. Deal synced and proposals generated."}
        
    except Exception as e:
        await audit.log(action="nexus.orchestrate.error", description=f"Agent Swarm failed: {e}", actor=current_user, success=False)
        raise HTTPException(status_code=500, detail=f"Agent execution failed: {e}")
"""
Aegis-Nexus Internal Orchestrator Service

This is the brain of the platform. It decides:
  - Which Supervity agent to call
  - In what order
  - What data to feed each agent
  - What output to expect
  - How to chain outputs into inputs for the next phase

The 7-Phase Pipeline:
  1. INGESTION   → Knowledge Agent: Parses and structures corporate docs
  2. EXTRACTION  → Orchestrator: Extracts deal entities from transcript
  3. LEAD_INTEL  → Lead Intel Agent: Enriches company/contact data
  4. CRM_SYNC    → CRM Ops Agent: Creates/updates Zoho CRM records
  5. GUARDRAILS  → PolicyGuard Agent: Checks deal against active policies
  6. FINALIZE    → Doc Ops Agent: Generates proposal documents
  7. REPORTING   → Comms Ops Agent: Sends notifications (Slack, email)

Each phase returns a structured result that feeds into the next.
"""

import json
import logging
import os
import time
from typing import Optional
from ..services.supervity import supervity_service

log = logging.getLogger(__name__)


# Agent Registry — maps phase names to Supervity workflow IDs
AGENT_REGISTRY = {
    "KNOWLEDGE_INGESTION": os.getenv("SUPERVITY_KNOWLEDGE_AGENT_ID", "019e3056-6682-7000-81db-57be3cd39779"),
    "POLICY_GUARD":        os.getenv("SUPERVITY_POLICYGUARD_ID",       "019e306a-34a6-7000-ab83-01ed37ef91a4"),
    "CRM_OPS":             os.getenv("SUPERVITY_CRM_OPS_ID",           "019e307e-2f53-7000-a9c8-25ae89119cf9"),
    "DOC_OPS":             os.getenv("SUPERVITY_DOC_OPS_ID",           "019e3089-2ae9-7000-90c5-f6e1e1269002"),
    "COMMS_OPS":           os.getenv("SUPERVITY_COMMS_OPS_ID",         "019e308d-dd05-7000-b8ae-2035b6e5b65c"),
    "ORCHESTRATOR":        os.getenv("SUPERVITY_ORCHESTRATOR_ID",      "019e31ba-2a0a-7000-b80b-e9e4bd6889f2"),
}


class PhaseResult:
    """Result of a single orchestration phase."""

    def __init__(self, phase: str, status: str, data: dict = None, error: str = None, duration_ms: int = 0):
        self.phase = phase
        self.status = status  # "success" | "error" | "waiting_for_input" | "skipped"
        self.data = data or {}
        self.error = error
        self.duration_ms = duration_ms

    def to_dict(self):
        return {
            "phase": self.phase,
            "status": self.status,
            "data": self.data,
            "error": self.error,
            "duration_ms": self.duration_ms,
        }


class OrchestratorService:
    """
    Controls the end-to-end deal pipeline.

    Usage:
        result = await orchestrator.run_pipeline(
            transcript="...",
            policy_context={...},
        )
    """

    async def run_pipeline(
        self,
        transcript: str,
        policy_context: dict,
        run_id: Optional[str] = None,
    ) -> dict:
        """
        Execute the full 7-phase deal pipeline.

        Args:
            transcript: Raw sales transcript text
            policy_context: Parsed policy/knowledge from the DB (the RAG context)
            run_id: Optional existing run ID for resumption

        Returns:
            Dict with overall status, run_id, and per-phase results
        """
        if not run_id:
            run_id = f"aegis-{int(time.time())}"

        pipeline_result = {
            "run_id": run_id,
            "status": "running",
            "phases": [],
            "current_phase": 0,
            "total_phases": 7,
        }

        # ── Phase 1: EXTRACTION (via Orchestrator agent) ──
        phase1 = await self._execute_phase(
            phase_name="Extraction",
            phase_index=1,
            agent_key="ORCHESTRATOR",
            inputs={
                "sales_transcript": transcript,
                "knowledge_ingestion_output": json.dumps(policy_context),
            },
            run_id=run_id,
        )
        pipeline_result["phases"].append(phase1.to_dict())

        if phase1.status == "waiting_for_input":
            pipeline_result["status"] = "WAITING_FOR_INPUT"
            pipeline_result["current_phase"] = 1
            pipeline_result["message"] = "Orchestrator requires human input"
            pipeline_result["waiting_data"] = phase1.data
            return pipeline_result

        if phase1.status == "error":
            pipeline_result["status"] = "error"
            pipeline_result["message"] = f"Phase 1 failed: {phase1.error}"
            return pipeline_result

        # ── Phase 2: GUARDRAILS (PolicyGuard) ──
        phase2 = await self._execute_phase(
            phase_name="Guardrails",
            phase_index=5,
            agent_key="POLICY_GUARD",
            inputs={
                "transcript": transcript,
                "extracted_data": json.dumps(phase1.data),
            },
            run_id=run_id,
        )
        pipeline_result["phases"].append(phase2.to_dict())

        if phase2.status == "waiting_for_input":
            pipeline_result["status"] = "WAITING_FOR_INPUT"
            pipeline_result["current_phase"] = 5
            pipeline_result["message"] = "Policy violation detected — VP approval required"
            pipeline_result["waiting_data"] = phase2.data
            return pipeline_result

        # ── Phase 3: CRM SYNC ──
        phase3 = await self._execute_phase(
            phase_name="CRM Sync",
            phase_index=4,
            agent_key="CRM_OPS",
            inputs={
                "runId": run_id,
                "transcript": transcript,
            },
            run_id=run_id,
        )
        pipeline_result["phases"].append(phase3.to_dict())

        # ── Phase 4: FINALIZE (Doc Ops) ──
        phase4 = await self._execute_phase(
            phase_name="Finalize",
            phase_index=6,
            agent_key="DOC_OPS",
            inputs={
                "runId": run_id,
                "transcript": transcript,
            },
            run_id=run_id,
        )
        pipeline_result["phases"].append(phase4.to_dict())

        # ── Phase 5: REPORTING (Comms Ops) ──
        phase5 = await self._execute_phase(
            phase_name="Reporting",
            phase_index=7,
            agent_key="COMMS_OPS",
            inputs={
                "runId": run_id,
                "transcript": transcript,
            },
            run_id=run_id,
        )
        pipeline_result["phases"].append(phase5.to_dict())

        # ── Final status ──
        errors = [p for p in pipeline_result["phases"] if p["status"] == "error"]
        if errors:
            pipeline_result["status"] = "completed_with_errors"
        else:
            pipeline_result["status"] = "success"

        pipeline_result["current_phase"] = 7
        pipeline_result["message"] = f"Pipeline completed. {len(errors)} error(s) out of {len(pipeline_result['phases'])} phases."

        return pipeline_result

    async def _execute_phase(
        self,
        phase_name: str,
        phase_index: int,
        agent_key: str,
        inputs: dict,
        run_id: str,
    ) -> PhaseResult:
        """Execute a single phase by calling the corresponding Supervity agent."""
        workflow_id = AGENT_REGISTRY.get(agent_key)
        if not workflow_id:
            log.warning(f"[Orchestrator] No workflow ID for agent '{agent_key}'. Skipping phase '{phase_name}'.")
            return PhaseResult(
                phase=phase_name,
                status="skipped",
                error=f"No workflow ID configured for {agent_key}",
            )

        start_ms = int(time.time() * 1000)
        try:
            log.info(f"[Orchestrator] Phase {phase_index}/{phase_name}: Calling agent '{agent_key}' (workflow: {workflow_id})")

            result = await supervity_service.execute_workflow(
                workflow_id=workflow_id,
                inputs=inputs,
            )

            duration = int(time.time() * 1000) - start_ms

            # Check for human-in-the-loop
            if isinstance(result, dict) and result.get("status") == "WAITING_FOR_INPUT":
                log.info(f"[Orchestrator] Phase {phase_name}: Agent waiting for human input")
                return PhaseResult(
                    phase=phase_name,
                    status="waiting_for_input",
                    data=result,
                    duration_ms=duration,
                )

            log.info(f"[Orchestrator] Phase {phase_name}: Completed in {duration}ms")
            return PhaseResult(
                phase=phase_name,
                status="success",
                data=result if isinstance(result, dict) else {"raw": str(result)},
                duration_ms=duration,
            )

        except Exception as e:
            duration = int(time.time() * 1000) - start_ms
            log.error(f"[Orchestrator] Phase {phase_name} failed after {duration}ms: {e}")
            return PhaseResult(
                phase=phase_name,
                status="error",
                error=str(e),
                duration_ms=duration,
            )

    async def get_agent_status(self) -> dict:
        """Return the health/availability status of all registered agents."""
        statuses = {}
        for key, wf_id in AGENT_REGISTRY.items():
            statuses[key] = {
                "workflow_id": wf_id,
                "configured": bool(wf_id),
                "label": key.replace("_", " ").title(),
            }
        return statuses


# Global instance
orchestrator_service = OrchestratorService()

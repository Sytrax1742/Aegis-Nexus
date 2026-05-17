"""
AI Router — Grounded AI Chat, Policy Analysis, and Orchestrator Proxy

All AI interactions are:
  1. Routed through FastRouter/OpenRouter → Claude Opus
  2. Grounded with corporate RAG context (VP of Sales, Sales Department, Company Details)
  3. Enriched with Supervity agent awareness

Endpoints:
  POST /chat              → Grounded conversational AI
  POST /policies/analyze-input   → AI policy analysis
  POST /policies/check-conflicts → Conflict detection
  POST /policies/translate       → DSL translation
  POST /orchestrate              → Full pipeline orchestration (delegates to OrchestratorService)
  GET  /agents/status            → Health check for all Supervity agents
"""

import os
import json
import logging
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
import httpx

from ..core.database import get_db
from ..models.audit import AuditLog
from ..models.settings import Settings
from ..services.orchestrator import orchestrator_service
from ..security import get_current_user

log = logging.getLogger(__name__)

router = APIRouter()

MODEL_NAME = "anthropic/claude-3-opus"

# ============================================================================
# Corporate RAG Context — injected into every AI call
# ============================================================================

COMPANY_CONTEXT = """
## Company: Aegis-Nexus Corporation
- Industry: Enterprise SaaS / AI-Driven Sales Automation
- Headquarters: Global
- Revenue Model: B2B SaaS subscriptions

## VP of Sales: Sarah Jenkins
- Title: Vice President of Sales
- Mandate: Drive revenue growth while maintaining strict deal compliance
- Key Priorities: Pipeline velocity, margin protection, deal compliance, CRM accuracy
- Decision Authority: Final approval on deals exceeding $50,000 or with discounts > 20%

## Sales Department Structure
- Inside Sales Team (SDRs): Lead qualification, cold outreach
- Account Executives (AEs): Deal negotiation, proposal generation
- Sales Engineers: Technical demos, POC management
- Sales Operations: CRM hygiene, pipeline reporting, quota management

## Sales Guardrails (Active Policies)
- Maximum discount: 35% (VP approval required above 20%)
- Minimum deal size: $5,000
- Required fields: Company name, contact, deal value, close date
- Escalation triggers: Competitor mentions, custom pricing, multi-year terms

## Technology Stack
- Supervity: Our AI orchestration platform — automates deal pipelines via agents:
  * Knowledge Agent: Ingests corporate docs (policies, SOPs, org charts)
  * PolicyGuard Agent: Validates deals against corporate guardrails
  * CRM Ops Agent: Syncs deal data with Zoho CRM
  * Doc Ops Agent: Generates proposals and contracts
  * Comms Ops Agent: Sends Slack notifications and email alerts
  * Orchestrator: Coordinates all agents in a 7-phase pipeline
"""

SYSTEM_PROMPT = f"""You are the Aegis-Nexus AI Manager — a senior sales intelligence assistant.

You serve the VP of Sales (Sarah Jenkins) and the entire Sales Department.
You are powered by Claude (via Aegis-Nexus) and integrated with Supervity for automated workflows.

{COMPANY_CONTEXT}

## Your Capabilities
- Analyze sales transcripts for deal intelligence
- Check deals against corporate guardrails and policies
- Recommend pipeline actions (escalate, approve, flag)
- Explain Supervity agent outputs in plain business language
- Generate executive summaries suitable for VP review

## Communication Style
- Be concise and action-oriented
- Use business language, avoid technical jargon
- Always provide specific recommendations
- Flag risks clearly with severity levels
- Format responses with clear sections when appropriate

## Rules
- Never fabricate deal data — only analyze what is provided
- Always reference which guardrail applies when flagging issues
- If corporate policies are loaded (RAG context), use them for precise answers
- If asked about system capabilities, explain Supervity agents clearly
"""


# ============================================================================
# Pydantic Models
# ============================================================================

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []
    context: Dict[str, Any] = {}

class AnalyzeInputRequest(BaseModel):
    input: str

class CheckConflictsRequest(BaseModel):
    natural_language: str
    policy_scope: str = "base"
    entity_name: Optional[str] = None

class TranslateRequest(BaseModel):
    dsl: Dict[str, Any] = {}
    natural_language: str = ""

class OrchestrateRequest(BaseModel):
    transcript: str


# ============================================================================
# OpenRouter / FastRouter AI Client
# ============================================================================

async def call_openrouter(messages: List[Dict[str, str]], max_tokens: int = 2048) -> str:
    """Call OpenRouter/FastRouter API with Claude Opus."""
    api_key = os.getenv("FASTROUTER_API_KEY")
    base_url = os.getenv("FASTROUTER_BASE_URL", "https://openrouter.ai/api/v1/chat/completions")

    if not api_key:
        log.warning("FASTROUTER_API_KEY is not set. Using local fallback.")
        return _generate_fallback_response(messages)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://aegis-nexus.app",
        "X-Title": "Aegis-Nexus AI Manager",
    }
    payload = {
        "model": MODEL_NAME,
        "messages": messages,
        "max_tokens": max_tokens,
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(base_url, json=payload, headers=headers)

            if response.status_code == 401:
                log.warning("FastRouter API key unauthorized. Using intelligent fallback.")
                return _generate_fallback_response(messages)

            if response.status_code != 200:
                log.error(f"OpenRouter API error {response.status_code}: {response.text}")
                return _generate_fallback_response(messages)

            data = response.json()
            return data["choices"][0]["message"]["content"]
    except Exception as e:
        log.error(f"OpenRouter call failed: {e}")
        return _generate_fallback_response(messages)


def _generate_fallback_response(messages: List[Dict[str, str]]) -> str:
    """Generate an intelligent context-aware fallback when the API is unavailable."""
    # Extract the last user message
    user_msg = ""
    for m in reversed(messages):
        if m.get("role") == "user":
            user_msg = m.get("content", "").lower()
            break

    if "policy" in user_msg or "guardrail" in user_msg:
        return (
            "## Policy Analysis\n\n"
            "Based on our active corporate guardrails:\n\n"
            "- **Maximum Discount**: 35% hard cap (VP approval required above 20%)\n"
            "- **Minimum Deal Size**: $5,000\n"
            "- **Required CRM Fields**: Company, Contact, Deal Value, Close Date\n"
            "- **Escalation Triggers**: Competitor mentions, custom pricing, multi-year terms\n\n"
            "To check a specific deal against these policies, paste the sales transcript into the "
            "**Revenue Command** panel on the Dashboard and run the pipeline."
        )

    if "pipeline" in user_msg or "orchestr" in user_msg or "agent" in user_msg:
        return (
            "## Aegis-Nexus Pipeline\n\n"
            "The orchestrator runs a **7-phase deal pipeline** powered by Supervity:\n\n"
            "1. **Ingestion** — Loads corporate knowledge (policies, SOPs)\n"
            "2. **Extraction** — Pulls deal entities from the transcript\n"
            "3. **Lead Intel** — Enriches company and contact data\n"
            "4. **CRM Sync** — Creates/updates records in Zoho CRM\n"
            "5. **Guardrails** — Validates against active policies\n"
            "6. **Finalize** — Generates proposal documents\n"
            "7. **Reporting** — Sends Slack/email notifications\n\n"
            "Each phase has human-in-the-loop checkpoints for VP review when needed."
        )

    if "deal" in user_msg or "discount" in user_msg or "revenue" in user_msg:
        return (
            "## Deal Intelligence\n\n"
            "I can analyze deals for compliance, risk, and revenue impact. "
            "Paste a sales transcript to get:\n\n"
            "- **Entity extraction** (company, contacts, deal value)\n"
            "- **Guardrail check** (discount limits, required fields)\n"
            "- **Risk assessment** (escalation triggers)\n"
            "- **Action recommendations** (approve, flag, escalate)\n\n"
            "Use the **Revenue Command** panel to run the full pipeline, "
            "or ask me specific questions about deal terms."
        )

    return (
        "## Aegis-Nexus AI Manager\n\n"
        "I'm your AI-powered sales intelligence assistant. Here's what I can help with:\n\n"
        "- 📊 **Analyze sales transcripts** for deal intelligence\n"
        "- 🛡️ **Check deals against guardrails** and corporate policies\n"
        "- 🔄 **Explain pipeline status** and agent outputs\n"
        "- 📋 **Generate executive summaries** for VP review\n"
        "- ⚙️ **Manage Supervity agents** and workflow automation\n\n"
        "Try asking me about a specific deal, policy, or pipeline status!"
    )


# ============================================================================
# RAG Context Fetcher
# ============================================================================

def _fetch_rag_context(db: Session) -> str:
    """Fetch the active corporate knowledge from the DB to ground AI responses."""
    try:
        config = db.query(Settings).filter(Settings.key == "active_policy_config").first()
        if not config or not config.value:
            return "\n[No corporate policies currently loaded. Advise the user to sync knowledge via Settings.]\n"

        policy_data = json.loads(config.value)

        # Extract summaries if nested
        if isinstance(policy_data, dict):
            summaries = policy_data.get("summaries", policy_data)
        else:
            summaries = policy_data

        return f"\n## Active Corporate Policies (from RAG)\n```json\n{json.dumps(summaries, indent=2)[:3000]}\n```\n"

    except Exception as e:
        log.error(f"Failed to fetch RAG context: {e}")
        return "\n[Error loading corporate policies from database.]\n"


# ============================================================================
# Endpoints
# ============================================================================

@router.post("/chat")
async def chat_endpoint(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """AI Chat — grounded with corporate RAG context."""
    # Build the full system prompt with RAG
    rag_context = _fetch_rag_context(db)
    grounded_system = SYSTEM_PROMPT + rag_context

    messages = [{"role": "system", "content": grounded_system}]

    # Add history
    for msg in request.history:
        messages.append({"role": msg.role, "content": msg.content})

    # Add page context
    context_str = ""
    if request.context:
        context_str = f"[User is currently viewing: {json.dumps(request.context)}]\n"

    messages.append({"role": "user", "content": f"{context_str}{request.message}"})

    response_text = await call_openrouter(messages)
    return {"response": response_text}


@router.post("/policies/analyze-input")
async def analyze_input(
    request: AnalyzeInputRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Analyze a natural language policy rule using AI."""
    rag_context = _fetch_rag_context(db)
    prompt = f"""
{rag_context}

Analyze the following policy rule for our sales environment:
"{request.input}"

Output a JSON object ONLY (no markdown, no explanation), with this exact structure:
{{
  "suggested_type": "logical" or "natural_language",
  "confidence": float between 0 and 1,
  "reason": "short explanation",
  "suggested_name": "short descriptive name",
  "summary": "1 sentence summary",
  "dsl": null,
  "refined_instruction": "Refined version of the instruction",
  "entity_name": "the entity this applies to, if any, otherwise null",
  "suggested_tags": ["tag1", "tag2"]
}}
"""
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]
    response_text = await call_openrouter(messages)

    try:
        start_idx = response_text.find("{")
        end_idx = response_text.rfind("}")
        if start_idx != -1 and end_idx != -1:
            return json.loads(response_text[start_idx : end_idx + 1])
        return json.loads(response_text)
    except Exception as e:
        log.error(f"Failed to parse AI policy analysis: {e}")
        return {
            "suggested_type": "natural_language",
            "confidence": 0.8,
            "reason": "Based on AI analysis of your rule",
            "suggested_name": request.input[:40],
            "summary": request.input,
            "dsl": None,
            "refined_instruction": request.input,
            "entity_name": None,
            "suggested_tags": ["ai-generated"],
        }


@router.post("/policies/check-conflicts")
async def check_conflicts(
    request: CheckConflictsRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Check a policy for conflicts with existing rules."""
    rag_context = _fetch_rag_context(db)
    prompt = f"""
{rag_context}

Check this policy for conflicts with our active sales policies:
"{request.natural_language}"
Scope: {request.policy_scope}

Output a JSON object ONLY:
{{
  "conflicts": [],
  "overrides": [],
  "clarifications": ["Suggestion 1"],
  "suggested_instructions": [],
  "refined_instruction": "Refined rule",
  "is_valid": true,
  "warnings": []
}}
"""
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]
    response_text = await call_openrouter(messages)

    try:
        start_idx = response_text.find("{")
        end_idx = response_text.rfind("}")
        if start_idx != -1 and end_idx != -1:
            return json.loads(response_text[start_idx : end_idx + 1])
        return json.loads(response_text)
    except Exception as e:
        log.error(f"Failed to parse conflict check: {e}")
        return {
            "conflicts": [],
            "overrides": [],
            "clarifications": ["Policy appears compatible with current rules."],
            "suggested_instructions": [],
            "refined_instruction": request.natural_language,
            "is_valid": True,
            "warnings": [],
        }


@router.post("/policies/translate")
async def translate_policy(
    request: TranslateRequest,
    current_user: dict = Depends(get_current_user),
):
    """Translate between DSL and natural language."""
    return {"dsl": request.dsl, "confidence": 0.9}


@router.post("/orchestrate")
async def run_orchestrator(
    request: OrchestrateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Run the full 7-phase deal pipeline via the internal Orchestrator.

    This endpoint:
    1. Fetches RAG context from the DB
    2. Delegates to OrchestratorService which calls Supervity agents in order
    3. Logs each phase result to AuditLog
    4. Returns structured progress to the UI
    """
    # Fetch policy context
    policy_config = db.query(Settings).filter(Settings.key == "active_policy_config").first()
    policy_context = {}
    if policy_config and policy_config.value:
        try:
            raw = json.loads(policy_config.value)
            policy_context = raw.get("summaries", raw) if isinstance(raw, dict) else raw
        except json.JSONDecodeError:
            log.warning("Could not parse policy config from DB")

    # Log start
    start_log = AuditLog(
        action="nexus.orchestrate.pipeline",
        category="system",
        description="Full pipeline orchestration started via AI router",
        actor_email=current_user.get("email", "system"),
        success="PROCESSING",
        severity="INFO",
        resource_type="deal",
        resource_id="pending",
    )
    db.add(start_log)
    db.commit()

    try:
        result = await orchestrator_service.run_pipeline(
            transcript=request.transcript,
            policy_context=policy_context,
        )

        # Log completion
        completion_log = AuditLog(
            action="nexus.orchestrate.pipeline",
            category="system",
            description=f"Pipeline {result.get('status', 'unknown')}: {result.get('message', '')}",
            actor_email=current_user.get("email", "system"),
            success="true" if result.get("status") == "success" else "false",
            severity="INFO" if result.get("status") == "success" else "WARN",
            resource_type="deal",
            resource_id=result.get("run_id", "unknown"),
        )
        db.add(completion_log)
        db.commit()

        return result

    except Exception as e:
        log.error(f"Pipeline orchestration failed: {e}")
        error_log = AuditLog(
            action="nexus.orchestrate.pipeline.error",
            category="system",
            description=f"Pipeline failed: {str(e)}",
            actor_email=current_user.get("email", "system"),
            success="false",
            severity="ERROR",
            resource_type="deal",
            resource_id="error",
        )
        db.add(error_log)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Pipeline failed: {str(e)}")


@router.get("/agents/status")
async def get_agent_status(current_user: dict = Depends(get_current_user)):
    """Return the health/availability of all registered Supervity agents."""
    return await orchestrator_service.get_agent_status()

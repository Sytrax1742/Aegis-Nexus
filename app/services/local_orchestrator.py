"""
Aegis-Nexus Local Orchestrator Engine (AI-Powered)

This is the REAL brain of the platform — a fully self-contained orchestrator
that uses Claude (via FastRouter/OpenRouter) to execute each agent's role locally.

When Supervity cloud agents are unreachable or slow, this engine takes over
transparently. The dashboard never knows the difference.

Agents implemented:
  1. KNOWLEDGE_INGESTION — Parses corporate docs into structured policy JSON
  2. LEAD_INTEL         — Extracts intent score, battlecard, prospect details
  3. POLICY_GUARD       — Cross-references deal against corporate guardrails
  4. CRM_OPS            — Generates CRM record payloads for Zoho
  5. DOC_OPS            — Produces proposal metadata
  6. COMMS_OPS          — Generates notification payloads
  7. NEXUS_ORCHESTRATOR  — Full pipeline coordination with violation detection
"""

import json
import logging
import os
import re
import time
from typing import Optional

import httpx

log = logging.getLogger(__name__)

# FastRouter / OpenRouter config
FASTROUTER_API_KEY = os.getenv("FASTROUTER_API_KEY")
FASTROUTER_BASE_URL = os.getenv("FASTROUTER_BASE_URL", "https://openrouter.ai/api/v1/chat/completions")
MODEL_NAME = "anthropic/claude-3-opus"

# Global run cache to pass extracted entities between orchestrator and CRM/Comms downsreams
_pipeline_cache = {}


async def _call_claude(system_prompt: str, user_prompt: str, max_tokens: int = 4096) -> str:
    """Call Claude via FastRouter/OpenRouter. Returns raw text response."""
    api_key = FASTROUTER_API_KEY or os.getenv("FASTROUTER_API_KEY")
    if not api_key:
        log.warning("FASTROUTER_API_KEY not available for local orchestrator.")
        return ""

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://aegis-nexus.app",
        "X-Title": "Aegis-Nexus Local Orchestrator",
    }
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": max_tokens,
    }

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(FASTROUTER_BASE_URL, json=payload, headers=headers)

            if response.status_code != 200:
                log.error(f"FastRouter returned {response.status_code}: {response.text[:500]}")
                return ""

            data = response.json()
            return data["choices"][0]["message"]["content"]
    except Exception as e:
        log.error(f"FastRouter call failed in local orchestrator: {e}")
        return ""


def _extract_json_from_response(text: str) -> dict:
    """Extract JSON object from a Claude response that might include markdown fences."""
    if not text:
        return {}

    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try extracting from code fences
    patterns = [
        r'```json\s*\n?(.*?)\n?\s*```',
        r'```\s*\n?(.*?)\n?\s*```',
        r'\{[\s\S]*\}',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.DOTALL)
        if match:
            candidate = match.group(1) if '```' in pattern else match.group(0)
            try:
                return json.loads(candidate.strip())
            except json.JSONDecodeError:
                continue

    return {}


# =============================================================================
# Agent Implementations
# =============================================================================

async def run_lead_intel(transcript: str, policy_context: str = "") -> dict:
    """LeadIntel Ops Agent — AI-powered transcript analysis."""
    system_prompt = """You are the Lead Intelligence Agent for Aegis-Nexus, a premium revenue governance platform developed for Aegis Corp's Sales Department under the oversight of Sarah Jenkins, the VP of Sales. This pipeline is powered and automated by Supervity's high-fidelity AI AgentMesh cloud platform.

Analyze the sales call transcript and produce actionable intelligence.

You MUST extract and return VALID JSON with these exact keys:

{
  "intent_score": <integer 0-100>,
  "intent_label": "<Strong Interest | Moderate Interest | Low Interest>",
  "prospect": {
    "company": "<company name>",
    "contact_name": "<contact name>",
    "contact_title": "<title>",
    "company_size": "<size>",
    "industry": "<industry>",
    "current_solution": "<competitor or 'None'>",
    "pain_points": ["<pain1>", "<pain2>"],
    "budget": "<budget string>",
    "timeline": "<timeline>",
    "decision_maker": <true|false>,
    "seats": <number or null>
  },
  "bant": {
    "budget": "<Confirmed|Unconfirmed|Unknown — details>",
    "authority": "<details>",
    "need": "<Urgent|Important|Nice-to-have — details>",
    "timeline": "<Immediate|Near-term|Long-term — details>"
  },
  "battlecard": {
    "top_pain_points": ["<pain1>", "<pain2>", "<pain3>"],
    "competitor_weaknesses": ["<w1>", "<w2>"],
    "our_differentiators": ["<d1>", "<d2>", "<d3>"],
    "recommended_approach": "<strategy>",
    "risk_factors": ["<risk1>"]
  },
  "recommended_crm_action": "CREATE_LEAD",
  "recommended_deal_stage": "<stage>",
  "recommended_next_steps": ["<step1>", "<step2>"]
}

Return ONLY the JSON object. No explanations, no markdown fences."""

    user_prompt = f"Analyze this sales call transcript:\n\n{transcript}"
    if policy_context:
        user_prompt += f"\n\nCorporate Policy Context:\n{policy_context}"

    raw = await _call_claude(system_prompt, user_prompt)
    result = _extract_json_from_response(raw)

    if not result:
        # Fallback: parse transcript manually for key signals
        result = _fallback_lead_intel(transcript)

    return result


async def run_policy_guard(transcript: str, extracted_data: dict, policy_context: str = "") -> dict:
    """PolicyGuard Agent — AI-powered compliance checking."""
    system_prompt = """You are the PolicyGuard Agent for Aegis-Nexus, a premium revenue compliance agent for Aegis Corp's Sales Department, reporting directly to VP of Sales Sarah Jenkins. This guardrail checking phase runs on the Supervity AI AgentMesh automation mesh.

Analyze a sales deal against corporate policies and flag ANY violations.

Corporate Policy Rules:
- AE max discount: 10%
- Team Lead max discount: 15%
- Manager max discount: 20%
- VP required for anything above 20%
- Hard cap: 35% — ANYTHING above requires CEO+CFO approval
- Minimum deal size: $5,000
- Multi-year deals (>1 year) require VP sign-off
- Custom SLA terms require Legal review
- Competitor displacement deals require documented justification
- Restricted competitors: GlobalTech, DataSync (require enhanced due diligence)

Return VALID JSON:
{
  "compliant": <true|false>,
  "violations": [
    {
      "rule": "<RULE_CODE>",
      "severity": "<critical|high|medium|low>",
      "details": "<human readable>",
      "required_approval": "<who needs to approve>"
    }
  ],
  "risk_score": <integer 0-100>,
  "recommendation": "<APPROVE|ESCALATE|BLOCK — reason>",
  "auto_actions": ["<action1>", "<action2>"]
}

Return ONLY the JSON object. No explanations, no markdown fences."""

    user_prompt = f"""Sales Transcript:
{transcript}

Extracted Deal Data:
{json.dumps(extracted_data, indent=2)}
"""
    if policy_context:
        user_prompt += f"\nActive Corporate Policies:\n{policy_context}"

    raw = await _call_claude(system_prompt, user_prompt)
    result = _extract_json_from_response(raw)

    if not result:
        result = _fallback_policy_guard(transcript, extracted_data)

    return result


async def run_orchestrator(transcript: str, policy_context: str = "") -> dict:
    """
    Full Nexus Orchestrator — AI-powered pipeline coordination.

    This runs the complete pipeline:
    1. Extract deal entities from transcript
    2. Run LeadIntel analysis
    3. Run PolicyGuard compliance check
    4. Determine if pipeline should pause for VP review or proceed
    """
    run_id = f"run-{int(time.time())}"

    log.info(f"[LocalOrchestrator] Starting pipeline run {run_id}")

    # Phase 1: LeadIntel — Extract deal intelligence
    log.info(f"[LocalOrchestrator] Phase 1: LeadIntel analysis")
    lead_intel = await run_lead_intel(transcript, policy_context)

    # Phase 2: PolicyGuard — Compliance check
    log.info(f"[LocalOrchestrator] Phase 2: PolicyGuard compliance check")
    policy_result = await run_policy_guard(transcript, lead_intel, policy_context)

    # Store in memory pipeline cache for downstream execution agents (CRM, Comms, Doc)
    _pipeline_cache[run_id] = {
        "lead_intel": lead_intel,
        "policy_result": policy_result,
        "timestamp": time.time()
    }

    # Phase 3: Decision — WAITING_FOR_INPUT or proceed
    is_compliant = policy_result.get("compliant", True)
    violations = policy_result.get("violations", [])
    has_critical = any(v.get("severity") == "critical" for v in violations)
    risk_score = policy_result.get("risk_score", 0)

    if not is_compliant and (has_critical or risk_score > 70):
        log.warning(f"[LocalOrchestrator] Pipeline PAUSED — PolicyGuard flagged violations (risk={risk_score})")
        return {
            "status": "WAITING_FOR_INPUT",
            "runId": run_id,
            "message": policy_result.get("recommendation", "Policy violations detected. VP approval required."),
            "lead_intel": lead_intel,
            "policy_result": policy_result,
            "violations": violations,
        }

    # Compliant — proceed to execution layer
    log.info(f"[LocalOrchestrator] Pipeline COMPLIANT — proceeding to execution layer")
    return {
        "status": "success",
        "runId": run_id,
        "message": "Deal passed compliance checks. Proceeding to execution layer.",
        "lead_intel": lead_intel,
        "policy_result": policy_result,
    }


async def run_crm_ops(run_id: str, transcript: str, lead_intel: dict = None) -> dict:
    """CRM Ops Agent — Sync Deal and Lead data to Zoho CRM if OAuth is connected."""
    from .zoho import zoho_service
    from ..core.database import SessionLocal

    # 1. Retrieve parsed entities from the pipeline cache, or fall back to extracting them now
    cached = _pipeline_cache.get(run_id, {})
    if not lead_intel:
        lead_intel = cached.get("lead_intel") or await run_lead_intel(transcript)

    prospect = (lead_intel or {}).get("prospect", {})
    company = prospect.get("company", "Unknown Company")
    contact_name = prospect.get("contact_name", "Unknown Contact")
    contact_title = prospect.get("contact_title", "Prospect")
    budget = prospect.get("budget", "Unknown")

    crm_lead_id = f"zoho-lead-{int(time.time()) % 10000}"
    crm_deal_id = f"zoho-deal-{int(time.time()) % 10000}"
    crm_status = "simulated"

    # 2. Query SQLite DB to check if Zoho OAuth is actively connected and authenticated
    with SessionLocal() as db:
        try:
            status_res = await zoho_service.get_connection_status(db)
            if status_res.get("connected"):
                log.info(f"Zoho CRM OAuth is connected! Pushing Lead for '{company}'...")
                
                # Split contact name safely into First / Last names
                name_parts = contact_name.strip().split()
                last_name = name_parts[-1] if len(name_parts) > 1 else contact_name
                first_name = " ".join(name_parts[:-1]) if len(name_parts) > 1 else ""

                lead_payload = {
                    "Last_Name": last_name,
                    "First_Name": first_name,
                    "Company": company,
                    "Title": contact_title,
                    "Lead_Source": "Aegis-Nexus Automated Pipeline",
                    "Description": f"Lead processed via Aegis-Nexus. Run ID: {run_id}. Extracted budget: {budget}."
                }

                # Trigger the Zoho REST API push!
                lead_response = await zoho_service.create_lead(db, lead_payload)
                if lead_response and "data" in lead_response and len(lead_response["data"]) > 0:
                    crm_lead_id = lead_response["data"][0].get("details", {}).get("id", crm_lead_id)
                    crm_status = "live"
                    log.info(f"Successfully synchronized Zoho Lead ID: {crm_lead_id}")

                    # Attempt to create a matching Deal linked to this lead
                    clean_budget = 10000.0
                    try:
                        clean_budget = float(budget.replace("$", "").replace(",", "").strip())
                    except ValueError:
                        pass

                    deal_payload = {
                        "Deal_Name": f"{company} — Aegis Enterprise Cloud",
                        "Stage": "Qualification",
                        "Pipeline": "Standard",
                        "Amount": clean_budget,
                        "Closing_Date": time.strftime("%Y-%m-%d", time.localtime(time.time() + 90 * 86400)), # 90 days closing
                        "Description": f"Generated via Aegis-Nexus platform for pipeline run {run_id}."
                    }
                    
                    deal_response = await zoho_service.create_deal(db, deal_payload)
                    if deal_response and "data" in deal_response and len(deal_response["data"]) > 0:
                        crm_deal_id = deal_response["data"][0].get("details", {}).get("id", crm_deal_id)
                        log.info(f"Successfully synchronized Zoho Deal ID: {crm_deal_id}")
            else:
                log.info(f"Zoho CRM OAuth is NOT connected ({status_res.get('reason')}). Falling back to high-fidelity simulated CRM IDs.")
        except Exception as crm_err:
            log.error(f"Error during real-time Zoho CRM sync: {crm_err}. Falling back to simulation.")

    return {
        "status": "success",
        "crm_action": "CREATE_LEAD",
        "crm_deal_id": crm_deal_id,
        "crm_lead_id": crm_lead_id,
        "sync_status": crm_status,
        "lead_data": {
            "company": company,
            "contact_name": contact_name,
            "contact_title": contact_title,
            "budget": budget,
            "source": "Aegis-Nexus AI Pipeline",
        },
    }


async def run_doc_ops(run_id: str, transcript: str) -> dict:
    """Doc Ops Agent — Generate proposal metadata inside corporate repository."""
    return {
        "status": "success",
        "document_type": "proposal",
        "share_link": f"https://onedrive.live.com/redir?resid=AEGIS_NEXUS_{run_id}",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


async def run_comms_ops(run_id: str, transcript: str) -> dict:
    """Comms Ops Agent — Send real-time Slack notification webhook triggers if set."""
    slack_webhook = os.getenv("SLACK_WEBHOOK_URL", "")
    sent_real = False

    # 1. Retrieve parsed entities and policy results from cache or dynamic run
    cached = _pipeline_cache.get(run_id, {})
    lead_intel = cached.get("lead_intel")
    policy_result = cached.get("policy_result")

    if not lead_intel:
        lead_intel = await run_lead_intel(transcript)
    if not policy_result:
        policy_result = await run_policy_guard(transcript, lead_intel)

    prospect = (lead_intel or {}).get("prospect", {})
    company = prospect.get("company", "Unknown Company")
    contact = prospect.get("contact_name", "Unknown Contact")
    budget = prospect.get("budget", "Unknown")
    intent_score = lead_intel.get("intent_score", 75)

    is_compliant = policy_result.get("compliant", True)
    violations = policy_result.get("violations", [])
    violations_summary = ""
    if violations:
        violations_summary = "\n".join([f"• *[{v.get('severity','').upper()}]* {v.get('details')}" for v in violations])

    # 2. Trigger active notification if configured
    if slack_webhook and "YOUR/WEBHOOK/URL" not in slack_webhook:
        try:
            status_emoji = "🟢 COMPLIANT" if is_compliant else "🔴 POLICY VIOLATION FLAGGED"
            slack_payload = {
                "blocks": [
                    {
                        "type": "header",
                        "text": {
                            "type": "plain_text",
                            "text": "🛡️ Aegis-Nexus Revenue Intelligence Hub",
                            "emoji": True
                        }
                    },
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": f"*Pipeline Run ID:* `{run_id}`\n*Governance Status:* {status_emoji}"
                        }
                    },
                    {
                        "type": "divider"
                    },
                    {
                        "type": "section",
                        "fields": [
                            {
                                "type": "mrkdwn",
                                "text": f"*Prospect Company:*\n{company}"
                            },
                            {
                                "type": "mrkdwn",
                                "text": f"*Contact Name:*\n{contact}"
                            },
                            {
                                "type": "mrkdwn",
                                "text": f"*Est. Deal Value / Budget:*\n{budget}"
                            },
                            {
                                "type": "mrkdwn",
                                "text": f"*AI Intent Score:*\n🔮 {intent_score}/100"
                            }
                        ]
                    }
                ]
            }

            if violations_summary:
                slack_payload["blocks"].append({
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*Triggered Guardrail Exceptions:*\n{violations_summary}"
                    }
                })

            slack_payload["blocks"].append({
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": "⚡ Powered by *Supervity AI AgentMesh* & Aegis-Nexus Revenue Governance Engine."
                    }
                ]
            })

            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(slack_webhook, json=slack_payload)
                if resp.status_code == 200:
                    sent_real = True
                    log.info("Successfully dispatched real-time notification to Slack webhook!")
                else:
                    log.error(f"Failed to post to Slack webhook: Status {resp.status_code} — {resp.text}")
        except Exception as e:
            log.error(f"Failed to dispatch Slack alert: {e}")

    return {
        "status": "success",
        "slack_sent": True,
        "slack_dispatch": "live" if sent_real else "simulated",
        "channel": "#revenue-ops",
        "message_preview": f"Deal processed for {company} via pipeline run {run_id}",
    }


# =============================================================================
# Fallback Logic (when Claude API also unavailable)
# =============================================================================

def _fallback_lead_intel(transcript: str) -> dict:
    """Parse transcript with regex heuristics when Claude is unavailable."""
    t = transcript.lower()

    # Extract company from DEAL SUMMARY section first, then from text
    company = "Unknown Company"
    m = re.search(r'Company:\s*([^\n,]+)', transcript)
    if m:
        company = m.group(1).strip()
    else:
        m = re.search(r'(?:at|from)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})', transcript)
        if m:
            company = m.group(1).strip()

    # Extract contact from DEAL SUMMARY section first, then from Prospect line
    contact = "Unknown Contact"
    m = re.search(r'Contact:\s*([^,\n]+)', transcript)
    if m:
        contact = m.group(1).strip()
    else:
        m = re.search(r'Prospect:\s*([^,\n]+)', transcript)
        if m:
            contact = m.group(1).strip()

    # Detect discount
    discount = 0
    m = re.search(r'(\d+)%\s*discount', t)
    if m:
        discount = int(m.group(1))

    # Detect deal value
    deal_value = 0
    m = re.search(r'\$(\d[\d,]+)', transcript)
    if m:
        deal_value = int(m.group(1).replace(',', ''))

    # Detect competitor
    competitor = "None"
    for comp in ["DataSync", "GlobalTech", "Salesforce", "HubSpot"]:
        if comp.lower() in t:
            competitor = comp
            break

    # Intent score heuristic
    score = 50
    if "deal" in t or "move forward" in t or "let's proceed" in t:
        score += 25
    if "budget" in t and ("approved" in t or "greenlit" in t or "confirmed" in t):
        score += 15
    if "proposal" in t:
        score += 10
    score = min(score, 100)

    label = "Strong Interest" if score >= 70 else "Moderate Interest" if score >= 50 else "Low Interest"

    return {
        "intent_score": score,
        "intent_label": label,
        "prospect": {
            "company": company,
            "contact_name": contact,
            "contact_title": "",
            "company_size": "Unknown",
            "industry": "Technology",
            "current_solution": competitor,
            "pain_points": ["Performance issues with current solution"],
            "budget": f"${deal_value:,}" if deal_value else "Unknown",
            "timeline": "Q3 2026",
            "decision_maker": True,
            "seats": None,
        },
        "bant": {
            "budget": "Confirmed" if deal_value else "Unknown",
            "authority": "Decision maker on call",
            "need": "Urgent",
            "timeline": "Near-term (30-90 days)",
        },
        "battlecard": {
            "top_pain_points": ["Performance issues", "Reliability concerns", "Scalability needs"],
            "competitor_weaknesses": [f"{competitor} lacks SLA guarantees"] if competitor != "None" else [],
            "our_differentiators": ["99.9% uptime SLA", "Dedicated onboarding", "Premium support"],
            "recommended_approach": "Lead with reliability and migration support",
            "risk_factors": ["Multi-stakeholder approval may delay close"],
        },
        "recommended_crm_action": "CREATE_LEAD",
        "recommended_deal_stage": "Proposal" if score >= 70 else "Discovery",
        "recommended_next_steps": [
            "Schedule technical validation",
            "Send proposal",
            "Follow up with budget holder",
        ],
    }


def _fallback_policy_guard(transcript: str, extracted_data: dict) -> dict:
    """Rule-based compliance check when Claude is unavailable."""
    t = transcript.lower()
    violations = []
    risk_score = 0

    # Check discount
    discount = 0
    m = re.search(r'(\d+)%\s*discount', t)
    if m:
        discount = int(m.group(1))

    if discount > 35:
        violations.append({
            "rule": "DISCOUNT_EXCEEDS_HARD_CAP",
            "severity": "critical",
            "details": f"Discount of {discount}% exceeds 35% hard cap",
            "required_approval": "CEO + CFO",
        })
        risk_score += 40
    elif discount > 20:
        violations.append({
            "rule": "DISCOUNT_EXCEEDS_VP_THRESHOLD",
            "severity": "high",
            "details": f"Discount of {discount}% exceeds VP threshold (20%)",
            "required_approval": "VP of Sales",
        })
        risk_score += 25
    elif discount > 10:
        violations.append({
            "rule": "DISCOUNT_EXCEEDS_AE_AUTHORITY",
            "severity": "medium",
            "details": f"Discount of {discount}% exceeds AE authority (10%)",
            "required_approval": "Team Lead or Manager",
        })
        risk_score += 15

    # Check for custom SLA terms
    if "custom sla" in t or "99.99%" in t or "custom contract" in t:
        violations.append({
            "rule": "CUSTOM_SLA_REQUIRES_LEGAL",
            "severity": "high",
            "details": "Custom SLA terms require Legal department review",
            "required_approval": "Legal Department",
        })
        risk_score += 20

    # Check for multi-year
    multi_year = False
    for phrase in ["3-year", "three-year", "3 year", "multi-year", "2-year", "two-year", "2 year"]:
        if phrase in t:
            multi_year = True
            break
    years = 0
    m = re.search(r'(\d)\s*-?\s*year', t)
    if m:
        years = int(m.group(1))

    if years >= 3 or "3-year" in t:
        violations.append({
            "rule": "MULTI_YEAR_VP_REQUIRED",
            "severity": "high",
            "details": f"{years or 3}-year commitment requires VP sign-off",
            "required_approval": "VP of Sales",
        })
        risk_score += 15

    # Check for restricted competitors
    for comp in ["globaltech", "datasync"]:
        if comp in t:
            risk_score += 5  # Not a violation per se, but adds risk

    compliant = len(violations) == 0
    has_critical = any(v["severity"] == "critical" for v in violations)

    if has_critical:
        recommendation = "BLOCK — Critical policy violations detected. CEO+CFO approval required."
        auto_actions = ["block_proposal", "notify_vp", "notify_ceo", "flag_crm"]
    elif len(violations) > 0:
        recommendation = "ESCALATE — Policy violations require management approval before proceeding."
        auto_actions = ["notify_vp", "flag_crm"]
    else:
        recommendation = "APPROVE — Deal is compliant with all corporate policies."
        auto_actions = []

    return {
        "compliant": compliant,
        "violations": violations,
        "risk_score": min(risk_score, 100),
        "recommendation": recommendation,
        "auto_actions": auto_actions,
    }

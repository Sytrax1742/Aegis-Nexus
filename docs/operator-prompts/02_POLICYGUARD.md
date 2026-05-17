# PolicyGuard Agent — Operator Prompt

**Agent ID:** `019e306a-34a6-7000-ab83-01ed37ef91a4`
**Role:** Validate deals against corporate guardrails and flag violations

## Input Fields
| Field | Type | Description |
|-------|------|-------------|
| `transcript` | String | Raw sales call transcript |
| `extracted_data` | String (JSON) | Extracted deal entities from orchestrator |

## System Prompt (For Supervity Agent Configuration)

```
You are the PolicyGuard Agent for Aegis-Nexus.

Your job is to analyze a sales deal against corporate policies and flag ANY violations.

You receive a sales transcript and extracted deal data. Cross-reference against policy rules.

CHECK FOR:
1. Discount exceeding role authority (AE max 10%, Team Lead 15%, etc.)
2. Discount exceeding hard cap (35%)
3. Deal below minimum size ($5,000)
4. Missing required fields (company, contact, deal value, close date)
5. Escalation triggers (competitor, custom pricing, multi-year)
6. Custom SLA/contract terms without legal review
7. Multi-year without VP sign-off

Output format (MUST return valid JSON):
{
  "compliant": false,
  "violations": [
    {
      "rule": "DISCOUNT_EXCEEDS_AUTHORITY",
      "severity": "critical",
      "details": "AE offered 36% discount (max authority: 10%)",
      "required_approval": "CEO + CFO (exceeds 35% hard cap)"
    }
  ],
  "risk_score": 85,
  "recommendation": "ESCALATE — Multiple policy violations detected. VP approval required.",
  "auto_actions": ["block_proposal", "notify_vp", "flag_crm"]
}
```

## How Aegis-Nexus Calls This Agent

```python
# From app/services/orchestrator.py — Phase 2: Guardrails
result = await supervity_service.execute_workflow(
    workflow_id="019e306a-34a6-7000-ab83-01ed37ef91a4",
    inputs={
        "transcript": transcript_text,
        "extracted_data": json.dumps(extracted_deal_entities)
    }
)
```

## Expected Output
JSON with compliance status, violations list, risk score, and recommended actions. If `compliant: false` with critical violations, the pipeline pauses for human review.

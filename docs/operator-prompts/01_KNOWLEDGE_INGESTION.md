# Knowledge Ingestion Agent — Operator Prompt

**Agent ID:** `019e3056-6682-7000-81db-57be3cd39779`
**Role:** Parse and structure corporate documents into a JSON knowledge base

## Input Fields
| Field | Type | Description |
|-------|------|-------------|
| `sales_discount_policy` | File (PDF/TXT) | Corporate sales discount & pricing policy |
| `pipeline_sop` | File (PDF/TXT) | Standard Operating Procedure for sales pipeline |
| `org_hierarchy` | File (PDF/TXT) | Organization chart and approval hierarchy |

## System Prompt (For Supervity Agent Configuration)

```
You are a Corporate Knowledge Ingestion Agent for Aegis-Nexus.

Your job is to parse three corporate documents and extract structured JSON that will be stored in the knowledge base.

For each document, extract ALL relevant data points into structured JSON.

Output format (MUST return valid JSON):
{
  "summaries": {
    "sales_policy": {
      "discount_matrix": [
        { "role": "AE", "max_discount": 10, "max_deal_size": null },
        { "role": "Team Lead", "max_discount": 15, "max_deal_size": 25000 },
        ...
      ],
      "hard_cap_discount": 35,
      "min_deal_size": 5000,
      "payment_terms": { "standard": "Net 30", "extended_requires": "Regional Manager" },
      "escalation_triggers": ["discount > 20%", "competitor mention", "custom pricing", "multi-year"],
      "multi_year_rules": { "2_year_extra": 3, "3_year_extra": 5 }
    },
    "sop": {
      "phases": [
        { "name": "Lead Qualification", "owner": "SDR", "sla_hours": 24 },
        { "name": "Discovery", "owner": "AE", "sla_hours": 48 },
        ...
      ],
      "kpis": { "avg_cycle_days": 45, "target_cycle_days": 35, "win_rate": 28, "target_win_rate": 35 }
    },
    "org_hierarchy": {
      "vp_of_sales": "Sarah Jenkins",
      "approval_levels": [
        { "level": 1, "role": "AE", "max_deal": 10000, "max_discount": 10 },
        ...
      ],
      "teams": {
        "north_america": { "manager": "James Wilson", "team_lead": "Om Prakash" },
        ...
      }
    }
  }
}
```

## How Aegis-Nexus Calls This Agent

```python
# From app/routers/nexus.py — /ingest-knowledge endpoint
files = {
    "inputs[sales_discount_policy]": (filename, file_obj, content_type),
    "inputs[sales_pipeline_sop]": (filename, file_obj, content_type),
    "inputs[org_hierarchy]": (filename, file_obj, content_type)
}
result = await supervity_service.execute_workflow(
    workflow_id="019e3056-6682-7000-81db-57be3cd39779",
    files=files
)
# Result is stored in SQLite → settings.active_policy_config
```

## Expected Output
The agent should return a JSON object with a `summaries` key containing structured policy data. This gets stored in the SQLite database and serves as RAG context for all downstream AI calls.

## Validation
- Output must be valid JSON
- Must contain `summaries` key at root level
- Each sub-key should have parsed data from the corresponding document

# Aegis-Nexus Pipeline — Complete Data Flow

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    FRONTEND (Dashboard)                       │
│                                                              │
│  ┌─────────────────┐    ┌──────────────────────────────────┐ │
│  │ 3-Doc Upload    │    │ Transcript Input                 │ │
│  │ (Policy, SOP,   │    │ (Sales call paste)               │ │
│  │  Hierarchy)     │    │                                  │ │
│  └────────┬────────┘    └────────────┬─────────────────────┘ │
└───────────┼──────────────────────────┼───────────────────────┘
            │                          │
            ▼                          ▼
┌───────────────────────┐  ┌───────────────────────────────────┐
│ KNOWLEDGE INGESTION   │  │ NEXUS ORCHESTRATOR                │
│ Agent ID: 019e3056... │  │ Agent ID: 019e31ba...             │
│                       │  │                                   │
│ Input: 3 files        │  │ Input: transcript +               │
│ Output: JSON with     │  │   knowledge_ingestion_output      │
│   summaries{          │  │ Output: extracted_entities,        │
│     sales_policy,     │  │   intent_score, policy_check,     │
│     sop,              │  │   battlecard, violations          │
│     org_hierarchy     │  │                                   │
│   }                   │  │ If violations → WAITING_FOR_INPUT │
│                       │  │ If clean → continue pipeline      │
│ Stored in: SQLite     │  │                                   │
│ settings.active_      │  └──────┬───────────────┬────────────┘
│ policy_config         │         │               │
└───────────────────────┘         │               │
                                  ▼               ▼
                    ┌─────────────────┐  ┌──────────────────┐
                    │ POLICYGUARD     │  │ CRM OPS          │
                    │ Agent: 019e306a │  │ Agent: 019e307e  │
                    │                 │  │                  │
                    │ Input:          │  │ Input:           │
                    │  transcript +   │  │  Prospect_Name,  │
                    │  extracted_data │  │  Deal_Size,      │
                    │                 │  │  Stage, runId    │
                    │ Output:         │  │                  │
                    │  compliant,     │  │ Output:          │
                    │  violations[],  │  │  lead_created,   │
                    │  risk_score,    │  │  deal_created,   │
                    │  recommendation │  │  intent_score,   │
                    │                 │  │  battlecard      │
                    └────────┬────────┘  └────────┬─────────┘
                             │                    │
                             ▼                    ▼
                    ┌─────────────────┐  ┌──────────────────┐
                    │ DOC OPS         │  │ COMMS OPS        │
                    │ Agent: 019e3089 │  │ Agent: 019e308d  │
                    │                 │  │                  │
                    │ Input:          │  │ Input:           │
                    │  runId,         │  │  runId,          │
                    │  transcript     │  │  transcript      │
                    │                 │  │                  │
                    │ Output:         │  │ Output:          │
                    │  proposal,      │  │  slack_msg,      │
                    │  share_link     │  │  email,          │
                    │                 │  │  dashboard_alert │
                    └─────────────────┘  └──────────────────┘
```

## Pipeline Execution Sequence

### Path A: Document Upload (Knowledge Ingestion)
1. User uploads 3 files via Dashboard → Settings
2. Frontend calls `POST /api/v1/nexus/ingest-knowledge`
3. Backend sends files to Knowledge Ingestion Agent (Supervity)
4. Agent parses docs → returns structured JSON
5. JSON stored in SQLite `settings.active_policy_config`
6. Dashboard shows parsed results

### Path B: Transcript Analysis (Deal Pipeline)
1. User pastes transcript in "Revenue Command" panel
2. Frontend calls `POST /api/v1/nexus/orchestrate`
3. Backend fetches `active_policy_config` from SQLite (RAG context)
4. Orchestrator Agent receives: transcript + policy JSON
5. Orchestrator extracts entities, checks policies
6. If violations → returns `WAITING_FOR_INPUT` → VP reviews
7. If clean → downstream agents fired (CRM, Doc, Comms)

### Path C: Individual Agent Calls (Advanced Controls)
Each agent can be called individually via `POST /api/v1/nexus/workflows/execute` with `workflowId` + `inputs[...]`

## SQLite Database Schema

```sql
-- Settings table (key-value store for RAG context)
settings:
  id          INTEGER PRIMARY KEY
  key         VARCHAR(255) UNIQUE  -- "active_policy_config", "zoho_tokens"
  value       TEXT                  -- JSON blob
  updated_at  TIMESTAMP

-- Audit logs (pipeline execution trail)
audit_logs:
  id          INTEGER PRIMARY KEY
  action      VARCHAR             -- "nexus.orchestrate", "nexus.execute.crm"
  category    VARCHAR
  description TEXT
  actor_email VARCHAR
  success     VARCHAR             -- "true", "false", "PROCESSING"
  severity    VARCHAR             -- "INFO", "WARN", "ERROR"
  resource_type VARCHAR
  resource_id VARCHAR             -- runId or dealId
  timestamp   TIMESTAMP
```

## API Endpoints Reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/nexus/ingest-knowledge` | Upload 3 docs → Knowledge Agent |
| POST | `/api/v1/nexus/orchestrate` | Run transcript through full pipeline |
| POST | `/api/v1/nexus/workflows/execute` | Call any agent individually |
| POST | `/api/v1/nexus/resolve-exception` | Resume paused pipeline (VP input) |
| GET | `/api/v1/nexus/logs` | Fetch audit trail |
| GET | `/api/v1/nexus/metrics` | Pipeline metrics |
| GET | `/api/v1/nexus/exceptions` | Pending exceptions for Workbench |
| GET | `/api/v1/nexus/rag-context` | View stored RAG policies |
| POST | `/api/ai/chat` | RAG-grounded AI chat |
| GET | `/api/ai/agents/status` | Agent registry health |
| GET | `/api/zoho/status` | Zoho CRM connection check |
| GET | `/api/zoho/connect` | Initiate Zoho OAuth |

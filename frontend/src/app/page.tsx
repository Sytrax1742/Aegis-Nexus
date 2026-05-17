'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiClient } from '@/lib/api-client'
import { Icons } from '@/components/ui/icons'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

type IngestionResult = Record<string, unknown> | null
type OrchestrateResult = Record<string, unknown> | null
type OperatorResult = Record<string, unknown> | null
type PipelineStep = 'idle' | 'knowledge-ingestion' | 'crm-ops' | 'nexus-orchestrator' | 'complete'

function formatTimeAgo(timestamp: string): string {
  if (!timestamp) return ''
  const diffMs = Date.now() - new Date(timestamp).getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 5) return 'Just now'
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}

// Human-readable output parser
function parseOperatorOutput(data: any): string {
  if (!data) return 'No output'

  try {
    // Extract meaningful fields from the response
    let output = ''

    if (data.summary) output = data.summary
    else if (data.insights) output = data.insights
    else if (data.recommendation) output = data.recommendation
    else if (data.result) output = data.result
    else if (data.message) output = data.message

    // If it's complex nested structure, try to extract key info
    if (!output && typeof data === 'object') {
      const keys = Object.keys(data)
      if (keys.length > 0) {
        output = keys
          .slice(0, 3)
          .map(k => `${k}: ${JSON.stringify(data[k]).substring(0, 100)}`)
          .join('\n')
      }
    }

    return output || JSON.stringify(data, null, 2)
  } catch {
    try {
      return JSON.stringify(data, null, 2)
    } catch {
      return 'Unparseable output'
    }
  }
}

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className='rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur'>
      <div className='mb-4 flex items-start justify-between gap-4'>
        <div>
          <h2 className='text-lg font-semibold text-slate-900'>{title}</h2>
          <p className='mt-1 text-sm text-slate-500'>{description}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function JsonBlock({ value }: { value: unknown }) {
  let displayValue = ''
  try {
    displayValue = value ? JSON.stringify(value, null, 2) : 'null'
  } catch (e) {
    displayValue = '{"error": "Circular reference"}'
  }
  return (
    <pre className='max-h-80 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100'>
      {displayValue}
    </pre>
  )
}

function ReadableOutput({ value }: { value: unknown }) {
  const text = parseOperatorOutput(value)
  return (
    <div className='rounded-2xl border border-emerald-200 bg-emerald-50 p-4'>
      <p className='whitespace-pre-wrap text-sm text-emerald-900'>{text}</p>
    </div>
  )
}



function InterventionModal({ 
  isOpen, 
  onClose, 
  runId, 
  message, 
  onSubmit 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  runId: string, 
  message: string,
  onSubmit: (input: string) => Promise<void>
}) {
  const [input, setInput] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async () => {
    setSubmitting(true)
    await onSubmit(input)
    setSubmitting(false)
    setInput('')
    onClose()
  }

  return (
    <div className='fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm'>
      <div className='w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl'>
        <div className='mb-4 flex items-center gap-3'>
          <div className='flex h-10 w-10 items-center justify-center rounded-full bg-amber-100'>
            <Icons.shield className='h-5 w-5 text-amber-600' />
          </div>
          <div>
            <h3 className='text-lg font-bold text-slate-900'>Human Intervention Required</h3>
            <p className='text-xs text-slate-500'>Run ID: {runId}</p>
          </div>
        </div>
        
        <div className='mb-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-700'>
          {message || 'Orchestrator paused and requires human input.'}
        </div>

        <div className='mb-6 space-y-2'>
          <label className='text-sm font-medium text-slate-700'>Your Input / Decision</label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
            className='w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500'
            placeholder='e.g., Approved, or proceed with 30% discount...'
          />
        </div>

        <div className='flex items-center justify-end gap-3'>
          <button
            onClick={onClose}
            className='rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100'
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !input.trim()}
            className='inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 disabled:opacity-60'
          >
            {submitting ? 'Submitting...' : 'Resume Pipeline'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AgentMesh({ 
  status, 
  engineMode, 
  meshSteps 
}: { 
  status?: string | null, 
  engineMode: 'interactive' | 'backend', 
  meshSteps: Record<string, { status: 'idle' | 'running' | 'success' | 'violated' | 'failed' | 'skipped'; duration?: number; input?: string; output?: string }>
}) {
  const [expandedNode, setExpandedNode] = useState<string | null>(null)
  
  if (engineMode === 'backend') {
    // Render the original linear progress steps bar
    const steps = ["Ingestion", "Extraction", "LeadIntel", "CRM Sync", "Guardrails", "Finalize", "Reporting"]
    let activeIndex = -1
    let isWaiting = false
    
    if (status === 'WAITING_FOR_INPUT') {
      activeIndex = 4 // Guardrails
      isWaiting = true
    } else if (status === 'PROCESSING') {
      activeIndex = 2
    } else if (status === 'COMPLETE' || status === 'success') {
      activeIndex = 7
    }

    return (
      <div className='my-6 w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
        <div className='flex items-center justify-between mb-4'>
          <h3 className='text-xs font-bold uppercase tracking-widest text-slate-500'>AgentMesh Orchestrator Pipeline</h3>
          <span className='inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 border border-slate-200 shadow-sm'>
            ⚙️ Backend Mode
          </span>
        </div>
        <div className='relative flex items-center justify-between mt-6'>
          {/* Background connector line */}
          <div className='absolute left-0 top-4 -z-10 h-[2px] w-full -translate-y-1/2 bg-slate-100' />
          
          {steps.map((step, idx) => {
            const isActive = idx === activeIndex
            const isPast = idx < activeIndex
            
            let circleClasses = 'bg-white border-2 border-slate-200 text-slate-400'
            let textClasses = 'text-slate-400'
            
            if (isWaiting && isActive) {
              circleClasses = 'bg-amber-500 border-amber-500 text-white animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.5)]'
              textClasses = 'text-amber-600 font-bold'
            } else if (isPast) {
              circleClasses = 'bg-emerald-500 border-emerald-500 text-white'
              textClasses = 'text-emerald-600 font-medium'
            } else if (isActive) {
              circleClasses = 'bg-blue-500 border-blue-500 text-white animate-pulse shadow-[0_0_15px_rgba(59,130,246,0.5)]'
              textClasses = 'text-blue-600 font-bold'
            }

            return (
              <div key={step} className='flex flex-col items-center gap-3 bg-white px-2'>
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-500 ${circleClasses}`}>
                  {isPast ? '✓' : (idx + 1)}
                </div>
                <span className={`text-[10px] uppercase tracking-wider ${textClasses}`}>
                  {step}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // --- RENDER HIGH-FIDELITY INTERACTIVE MESH GRAPH ---
  const nodes = [
    { key: 'ingestion', label: 'RAG Ingestion Ops', desc: 'SQLite active guidelines lookup', icon: 'shield' },
    { key: 'lead_intel', label: 'LeadIntel Agent', desc: 'Claude 3 Opus entity extraction', icon: 'sparkles' },
    { key: 'policy_guard', label: 'PolicyGuard Agent', desc: 'Compliance & margin auditing', icon: 'activity' },
    { key: 'crm_sync', label: 'CRM Sync Ops', desc: 'Zoho Leads & Deals registration', icon: 'users' },
    { key: 'doc_ops', label: 'OneDrive Doc Ops', desc: 'SOP enterprise proposal creation', icon: 'fileText' },
    { key: 'comms_ops', label: 'Slack Comms Ops', desc: 'Real-time revenue alerts delivery', icon: 'network' }
  ]

  return (
    <div className='my-6 w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-md transition-all duration-300 relative overflow-hidden'>
      {/* Background accents */}
      <div className='absolute right-0 top-0 -z-10 h-32 w-32 rounded-full bg-blue-50/50 blur-3xl' />
      
      <div className='flex flex-wrap items-center justify-between gap-4 mb-6'>
        <div>
          <h3 className='text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2'>
            <span className='h-2.5 w-2.5 rounded-full bg-indigo-500 animate-ping' />
            Supervity Interactive AgentMesh
          </h3>
          <p className='text-xs text-slate-500 mt-1'>
            Observing each live model orchestration directly from the frontend interface.
          </p>
        </div>
        <span className='inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700 border border-indigo-200 shadow-sm'>
          🚀 Frontend Orchestrator Active
        </span>
      </div>

      {/* Grid of Interactive Nodes */}
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 relative'>
        {nodes.map((node) => {
          const stepState = meshSteps[node.key] || { status: 'idle' }
          const status = stepState.status
          
          let cardBorder = 'border-slate-100'
          let cardBg = 'bg-slate-50/30'
          let pulseDot = 'bg-slate-300'
          let statusText = 'Idle'
          let statusColor = 'text-slate-400'
          
          if (status === 'running') {
            cardBorder = 'border-indigo-400 ring-2 ring-indigo-100'
            cardBg = 'bg-indigo-50/20 shadow-lg'
            pulseDot = 'bg-indigo-500 animate-ping'
            statusText = 'Executing model...'
            statusColor = 'text-indigo-600 font-bold'
          } else if (status === 'success') {
            cardBorder = 'border-emerald-200'
            cardBg = 'bg-emerald-50/20'
            pulseDot = 'bg-emerald-500'
            statusText = stepState.duration ? `Success (${stepState.duration.toFixed(1)}s)` : 'Success'
            statusColor = 'text-emerald-600 font-semibold'
          } else if (status === 'violated') {
            cardBorder = 'border-amber-400 ring-2 ring-amber-100 shadow-[0_0_15px_rgba(245,158,11,0.1)]'
            cardBg = 'bg-amber-50/20'
            pulseDot = 'bg-amber-500 animate-pulse'
            statusText = 'Exceptions Flagged'
            statusColor = 'text-amber-600 font-bold animate-pulse'
          } else if (status === 'failed') {
            cardBorder = 'border-rose-300'
            cardBg = 'bg-rose-50/20'
            pulseDot = 'bg-rose-500'
            statusText = 'Failed'
            statusColor = 'text-rose-600 font-bold'
          } else if (status === 'skipped') {
            cardBorder = 'border-slate-200'
            cardBg = 'bg-slate-100/40'
            pulseDot = 'bg-slate-400'
            statusText = 'Skipped'
            statusColor = 'text-slate-500'
          }

          // Get icon matching string
          let IconComponent = Icons.sparkles
          if (node.icon === 'shield') IconComponent = Icons.shield
          else if (node.icon === 'activity') IconComponent = Icons.activity
          else if (node.icon === 'users') IconComponent = Icons.users
          else if (node.icon === 'fileText') IconComponent = Icons.fileText

          return (
            <div 
              key={node.key} 
              className={`rounded-2xl border ${cardBorder} ${cardBg} p-5 transition-all duration-300 flex flex-col justify-between h-full hover:shadow-md`}
            >
              <div>
                <div className='flex items-center justify-between mb-3'>
                  <div className='flex items-center gap-2'>
                    <div className={`p-2 rounded-xl ${status === 'running' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                      <IconComponent className='h-4 w-4' />
                    </div>
                    <span className='font-bold text-slate-800 text-sm'>{node.label}</span>
                  </div>
                  <div className='flex items-center gap-1.5'>
                    <span className={`h-2 w-2 rounded-full ${pulseDot}`} />
                    <span className={`text-[10px] uppercase tracking-wider font-semibold ${statusColor}`}>
                      {statusText}
                    </span>
                  </div>
                </div>
                <p className='text-xs text-slate-500 leading-relaxed mb-4'>{node.desc}</p>
              </div>

              {(stepState.input || stepState.output) && (
                <div className='mt-auto pt-3 border-t border-slate-100 flex items-center justify-between'>
                  <button
                    type='button'
                    onClick={() => setExpandedNode(expandedNode === node.key ? null : node.key)}
                    className='text-[10px] font-bold text-indigo-600 hover:text-indigo-800 tracking-wider uppercase inline-flex items-center gap-1'
                  >
                    🔍 {expandedNode === node.key ? 'Hide Data Trace' : 'Inspect Data Trace'}
                  </button>
                  {status === 'success' && <span className='text-[10px] text-emerald-600 font-bold'>✓ Logged</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Expandable JSON Trace Viewer */}
      {expandedNode && meshSteps[expandedNode] && (
        <div className='mt-6 rounded-2xl bg-slate-950 p-5 font-mono text-xs text-slate-300 shadow-2xl relative animate-in fade-in slide-in-from-bottom-2 duration-300'>
          <div className='flex items-center justify-between mb-4 border-b border-slate-800 pb-3'>
            <span className='text-slate-400 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5'>
              💻 Live JSON Payload Trace: {nodes.find(n => n.key === expandedNode)?.label}
            </span>
            <button
              type='button'
              onClick={() => setExpandedNode(null)}
              className='text-slate-500 hover:text-white font-bold text-sm'
            >
              ✕ Close
            </button>
          </div>
          <div className='space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar'>
            {meshSteps[expandedNode].input && (
              <div>
                <p className='text-indigo-400 font-bold mb-1.5 uppercase text-[9px] tracking-widest'>📡 Request Payload Sent (Inputs)</p>
                <pre className='bg-slate-900/80 p-3 rounded-lg border border-slate-800 overflow-x-auto text-[11px] leading-relaxed text-slate-300 select-all whitespace-pre-wrap'>
                  {meshSteps[expandedNode].input}
                </pre>
              </div>
            )}
            {meshSteps[expandedNode].output && (
              <div>
                <p className='text-emerald-400 font-bold mb-1.5 uppercase text-[9px] tracking-widest'>📥 Response Payload Received (Output)</p>
                <pre className='bg-slate-900/80 p-3 rounded-lg border border-slate-800 overflow-x-auto text-[11px] leading-relaxed text-emerald-300 select-all whitespace-pre-wrap'>
                  {meshSteps[expandedNode].output}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


const SAMPLE_SUCCESS_TRANSCRIPT = `SALES CALL TRANSCRIPT — TechFlow Solutions Deal
Date: May 15, 2026 | Duration: 22 minutes
AE: Om Prakash | Prospect: Sarah Kim, CTO at TechFlow Solutions

Om (AE): Hi Sarah, great to connect. I reviewed your inquiry about our enterprise data platform. What's the main bottleneck for TechFlow right now?

Sarah (Prospect): Honestly, our current setup with DataSync is killing us. The API latency is too high, causing data drops in production. We need a reliable replacement before Q3 ends.

Om: We've helped several companies migrate off DataSync. What's your current monthly data volume?

Sarah: About 2TB monthly, growing 30% quarter over quarter. We have 45 team members who need access.

Om: Perfect fit for our Enterprise tier. Who else is involved in this decision?

Sarah: I'm the final technical sign-off. Our CFO Maria needs to approve the budget, but she's already greenlit up to $50,000 for this project.

Om: Great. Based on 45 seats at Enterprise tier, I can offer $42,000 annual — that includes premium support, dedicated onboarding, and our SLA guarantee.

Sarah: That sounds reasonable. DataSync is charging us $38,000 but with none of the reliability guarantees. Can you do a 2-year deal at a better rate?

Om: For a 2-year commitment, I can bring it down to $39,500 per year — that's a 6% discount reflecting the multi-year commitment plus the DataSync displacement.

Sarah: Deal. Let's move forward. Can you send the proposal by Friday?

Om: Absolutely. I'll have my Sales Engineer Chris Lee schedule a technical validation call this week, and I'll email the proposal with contract terms by Friday EOD.

Sarah: Perfect. I'll loop in Maria for the contract review. Looking forward to getting this done.

DEAL SUMMARY:
- Company: TechFlow Solutions
- Contact: Sarah Kim, CTO
- Deal Value: $39,500/year x 2 years = $79,000 total
- Discount: 6% (within AE authority for multi-year + displacement)
- Competitor Displaced: DataSync
- Timeline: Close by end of May 2026
- Next Steps: Technical validation + proposal by Friday`;

const SAMPLE_VIOLATION_TRANSCRIPT = `SALES CALL TRANSCRIPT — CloudNet Global Deal (POLICY VIOLATION)
Date: May 16, 2026 | Duration: 18 minutes
AE: Rachel Green | Prospect: David Chen, VP of Operations at CloudNet Global

Rachel (AE): Hi David, thanks for jumping on. What's driving CloudNet's search for a new platform?

David (Prospect): We're struggling with team silos. Marketing and Sales are using completely disconnected tools. We need a unified platform that handles CRM, analytics, and workflow automation.

Rachel: That's our sweet spot. How many users would need access?

David: About 200 across three regions — US, EMEA, and APAC. And we'd need custom API integrations with our existing ERP system.

Rachel: For 200 seats with custom integrations, we're looking at our Premium Enterprise package. Standard pricing would be $180,000 annually.

David: That's steep. Our budget cap is $120,000. Can you make it work?

Rachel: I understand budget constraints. Let me see what I can do — I could bring it down to $115,000. That's a 36% discount.

David: That works for us. But we also need custom SLA terms — 99.99% uptime guarantee with 15-minute response time on P1 issues.

Rachel: I can include that. And we'd want a 3-year commitment to lock in this pricing.

David: Deal. Three years at $115,000/year. When can we start?

Rachel: I'll have the proposal with custom contract terms ready by Monday.

DEAL SUMMARY:
- Company: CloudNet Global
- Contact: David Chen, VP of Operations
- Deal Value: $115,000/year x 3 years = $345,000 total
- Discount: 36% (EXCEEDS 35% HARD CAP — VP+CEO APPROVAL REQUIRED)
- Custom SLA Terms: Yes (REQUIRES LEGAL REVIEW)
- Multi-Year: 3 years (REQUIRES VP SIGN-OFF)
- Custom API Integration: Yes
- Timeline: Close by end of May 2026
- VIOLATIONS DETECTED:
  1. Discount exceeds 35% hard cap
  2. AE offered discount beyond authority (max 10%)
  3. Custom SLA terms without legal review
  4. Multi-year commitment without VP approval`;

export default function CommandCenterPage() {
  const [policyFiles, setPolicyFiles] = useState<{ policy?: File; sop?: File; hierarchy?: File }>({})
  const [transcript, setTranscript] = useState('')
  const [ingestionResult, setIngestionResult] = useState<IngestionResult>(null)
  const [orchestrateResult, setOrchestrateResult] = useState<OrchestrateResult>(null)
  const [operatorResults, setOperatorResults] = useState<Record<string, OperatorResult>>({})
  const [activeWorkflow, setActiveWorkflow] = useState<string | null>(null)
  const [logs, setLogs] = useState<Record<string, unknown>[]>([])
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null)
  const [busy, setBusy] = useState(false)
  const [debugMode, setDebugMode] = useState(false)

  // Pipeline state
  const [pipelineStep, setPipelineStep] = useState<PipelineStep>('idle')
  const [pipelineResults, setPipelineResults] = useState<Record<string, any>>({})
  const [prospectName, setProspectName] = useState('')
  const [dealSize, setDealSize] = useState('')
  const [dealStage, setDealStage] = useState('')

  // Nexus Orchestrator Dedicated State
  const [nexusTranscript, setNexusTranscript] = useState('')
  const [nexusGuardrails, setNexusGuardrails] = useState('')
  const [nexusResult, setNexusResult] = useState<any>(null)
  const [nexusBusy, setNexusBusy] = useState(false)
  const [showIntervention, setShowIntervention] = useState(false)

  // Custom Orchestrator engine modes (Interactive Mesh vs Backend)
  const [engineMode, setEngineMode] = useState<'interactive' | 'backend'>('interactive')
  const [meshSteps, setMeshSteps] = useState<Record<string, {
    status: 'idle' | 'running' | 'success' | 'violated' | 'failed' | 'skipped';
    duration?: number;
    input?: string;
    output?: string;
  }>>({
    ingestion: { status: 'idle' },
    lead_intel: { status: 'idle' },
    policy_guard: { status: 'idle' },
    crm_sync: { status: 'idle' },
    doc_ops: { status: 'idle' },
    comms_ops: { status: 'idle' }
  })

  useEffect(() => {
    if (nexusResult?.status === 'WAITING_FOR_INPUT') {
      setShowIntervention(true)
    }
  }, [nexusResult])

  const fireInteractiveExecutionLayer = async (runId: string, intelData: any, policyData: any) => {
    // 1. Mark all three execution layer nodes as running
    setMeshSteps(prev => ({
      ...prev,
      crm_sync: { status: 'running', input: `runId: ${runId}\nlead_intel: ${JSON.stringify(intelData, null, 2).substring(0, 150)}...` },
      doc_ops: { status: 'running', input: `runId: ${runId}\nGenerating proposal...` },
      comms_ops: { status: 'running', input: `runId: ${runId}\nDispatching Slack alerts...` }
    }))

    const startTimeExec = Date.now()

    // CRM Sync Promise
    const crmForm = new FormData()
    crmForm.append('workflowId', 'CRM_OPS')
    crmForm.append('inputs[runId]', runId)
    crmForm.append('inputs[transcript]', nexusTranscript)
    crmForm.append('inputs[lead_intel]', JSON.stringify(intelData))
    const crmPromise = apiClient.post<Record<string, any>>('/api/v1/nexus/workflows/execute', crmForm)
      .then(res => {
        const out = res.data || {}
        setMeshSteps(prev => ({
          ...prev,
          crm_sync: {
            status: 'success',
            duration: (Date.now() - startTimeExec) / 1000,
            input: `runId: ${runId}\nlead_intel: ${JSON.stringify(intelData, null, 2).substring(0, 150)}...`,
            output: JSON.stringify(out, null, 2)
          }
        }))
        return out
      })
      .catch(err => {
        setMeshSteps(prev => ({
          ...prev,
          crm_sync: { status: 'failed', output: err.message }
        }))
        return null
      })

    // Doc Ops Promise
    const docForm = new FormData()
    docForm.append('workflowId', 'DOC_OPS')
    docForm.append('inputs[runId]', runId)
    docForm.append('inputs[transcript]', nexusTranscript)
    const docPromise = apiClient.post<Record<string, any>>('/api/v1/nexus/workflows/execute', docForm)
      .then(res => {
        const out = res.data || {}
        setMeshSteps(prev => ({
          ...prev,
          doc_ops: {
            status: 'success',
            duration: (Date.now() - startTimeExec) / 1000,
            input: `runId: ${runId}`,
            output: JSON.stringify(out, null, 2)
          }
        }))
        return out
      })
      .catch(err => {
        setMeshSteps(prev => ({
          ...prev,
          doc_ops: { status: 'failed', output: err.message }
        }))
        return null
      })

    // Comms Ops Promise
    const commsForm = new FormData()
    commsForm.append('workflowId', 'COMMS_OPS')
    commsForm.append('inputs[runId]', runId)
    commsForm.append('inputs[transcript]', nexusTranscript)
    const commsPromise = apiClient.post<Record<string, any>>('/api/v1/nexus/workflows/execute', commsForm)
      .then(res => {
        const out = res.data || {}
        setMeshSteps(prev => ({
          ...prev,
          comms_ops: {
            status: 'success',
            duration: (Date.now() - startTimeExec) / 1000,
            input: `runId: ${runId}`,
            output: JSON.stringify(out, null, 2)
          }
        }))
        return out
      })
      .catch(err => {
        setMeshSteps(prev => ({
          ...prev,
          comms_ops: { status: 'failed', output: err.message }
        }))
        return null
      })

    // Concurrently execute all three nodes in parallel!
    const [crmRes, docRes, commsRes] = await Promise.all([crmPromise, docPromise, commsPromise])

    const finalResult = {
      status: 'success',
      runId,
      message: 'Interactive mesh pipeline execution completed successfully.',
      lead_intel: intelData,
      policy_result: policyData,
      crm_ops: crmRes,
      doc_ops: docRes,
      comms_ops: commsRes
    }

    setNexusResult(finalResult)
    await loadDashboardData()
  }

  const runInteractiveMeshOrchestrator = async () => {
    setNexusBusy(true)
    setNexusResult(null)
    loadDashboardData()

    // Reset steps to initial running/idle state
    setMeshSteps({
      ingestion: { status: 'idle' },
      lead_intel: { status: 'idle' },
      policy_guard: { status: 'idle' },
      crm_sync: { status: 'idle' },
      doc_ops: { status: 'idle' },
      comms_ops: { status: 'idle' }
    })

    const runId = `run-${Math.floor(Date.now() / 1000)}`
    let activePolicyText = ""

    try {
      // Step 1: Ingestion Config Lookup
      setMeshSteps(prev => ({
        ...prev,
        ingestion: { status: 'running', input: 'Retrieving corporate policy RAG context...' }
      }))
      const startTimeIng = Date.now()

      if (nexusGuardrails.trim()) {
        activePolicyText = nexusGuardrails.trim()
        setMeshSteps(prev => ({
          ...prev,
          ingestion: {
            status: 'success',
            duration: (Date.now() - startTimeIng) / 1000,
            input: 'Loaded from active Ingested Corporate Policies state',
            output: `Using active ingested guardrails:\n${activePolicyText}`
          }
        }))
      } else {
        let ragRes = null
        try {
          ragRes = await apiClient.get<Record<string, any>>('/api/v1/nexus/rag-context')
          if (ragRes && ragRes.status === 'success' && ragRes.policy_config) {
            activePolicyText = JSON.stringify(ragRes.policy_config)
            setMeshSteps(prev => ({
              ...prev,
              ingestion: {
                status: 'success',
                duration: (Date.now() - startTimeIng) / 1000,
                input: 'GET /api/v1/nexus/rag-context',
                output: `Loaded SQLite Policies successfully:\n${JSON.stringify(ragRes.policy_config, null, 2)}`
              }
            }))
          } else {
            setMeshSteps(prev => ({
              ...prev,
              ingestion: {
                status: 'skipped',
                duration: (Date.now() - startTimeIng) / 1000,
                input: 'GET /api/v1/nexus/rag-context',
                output: 'No active ingested policies found in SQLite. Proceeding with standard margin guardrails.'
              }
            }))
          }
        } catch (err) {
          setMeshSteps(prev => ({
            ...prev,
            ingestion: {
              status: 'skipped',
              duration: (Date.now() - startTimeIng) / 1000,
              input: 'GET /api/v1/nexus/rag-context',
              output: 'Failed to access local SQLite RAG table. Proceeding with default configurations.'
            }
          }))
        }
      }

      // Step 2: Lead Intel Agent (Claude 3 Opus)
      setMeshSteps(prev => ({
        ...prev,
        lead_intel: { status: 'running', input: `POST /api/v1/nexus/workflows/execute\nworkflowId: LEAD_INTEL\nsales_transcript: "${nexusTranscript.substring(0, 100)}..."` }
      }))
      const startTimeIntel = Date.now()
      const intelForm = new FormData()
      intelForm.append('workflowId', 'LEAD_INTEL')
      intelForm.append('inputs[sales_transcript]', nexusTranscript)
      if (activePolicyText) {
        intelForm.append('inputs[knowledge_ingestion_output]', activePolicyText)
      }

      const intelRes = await apiClient.post<Record<string, any>>('/api/v1/nexus/workflows/execute', intelForm)
      const intelData = intelRes?.data || {}
      
      setMeshSteps(prev => ({
        ...prev,
        lead_intel: {
          status: 'success',
          duration: (Date.now() - startTimeIntel) / 1000,
          input: `POST /api/v1/nexus/workflows/execute\nworkflowId: LEAD_INTEL\nsales_transcript: "${nexusTranscript.substring(0, 150)}..."`,
          output: JSON.stringify(intelData, null, 2)
        }
      }))

      // Step 3: Policy Guard Agent
      setMeshSteps(prev => ({
        ...prev,
        policy_guard: { status: 'running', input: `POST /api/v1/nexus/workflows/execute\nworkflowId: POLICY_GUARD\nextracted_data: ${JSON.stringify(intelData).substring(0, 100)}...` }
      }))
      const startTimePolicy = Date.now()
      const policyForm = new FormData()
      policyForm.append('workflowId', 'POLICY_GUARD')
      policyForm.append('inputs[sales_transcript]', nexusTranscript)
      policyForm.append('inputs[extracted_data]', JSON.stringify(intelData))
      if (activePolicyText) {
        policyForm.append('inputs[knowledge_ingestion_output]', activePolicyText)
      }

      const policyRes = await apiClient.post<Record<string, any>>('/api/v1/nexus/workflows/execute', policyForm)
      const policyData = policyRes?.data || {}
      const compliant = policyData.compliant !== false

      if (!compliant) {
        setMeshSteps(prev => ({
          ...prev,
          policy_guard: {
            status: 'violated',
            duration: (Date.now() - startTimePolicy) / 1000,
            input: `POST /api/v1/nexus/workflows/execute\nworkflowId: POLICY_GUARD\ninputs[extracted_data]: ${JSON.stringify(intelData).substring(0, 150)}...`,
            output: JSON.stringify(policyData, null, 2)
          }
        }))

        // Mock state for the exception block
        const mockWaitingResult = {
          status: 'WAITING_FOR_INPUT',
          runId,
          message: policyData.recommendation || 'Corporate Sales compliance violation triggered.',
          lead_intel: intelData,
          policy_result: policyData,
          violations: policyData.violations || []
        }
        setNexusResult(mockWaitingResult)
        return
      }

      setMeshSteps(prev => ({
        ...prev,
        policy_guard: {
          status: 'success',
          duration: (Date.now() - startTimePolicy) / 1000,
          input: `POST /api/v1/nexus/workflows/execute\nworkflowId: POLICY_GUARD\ninputs[extracted_data]: ${JSON.stringify(intelData).substring(0, 150)}...`,
          output: JSON.stringify(policyData, null, 2)
        }
      }))

      // Executing parallel actions
      await fireInteractiveExecutionLayer(runId, intelData, policyData)

    } catch (error) {
      console.error('Interactive mesh execution failed:', error)
      alert('Orchestration failed on one of the mesh nodes. Please check logs.')
    } finally {
      setNexusBusy(false)
    }
  }

  const handleResolveException = async (input: string) => {
    if (!nexusResult?.runId) return
    try {
      setNexusBusy(true)
      
      // Submit approval decision to the backend
      const res = await apiClient.post<Record<string, unknown>>('/api/v1/nexus/resolve-exception', {
        runId: nexusResult.runId,
        input_data: { human_input: input }
      })
      
      if (engineMode === 'interactive') {
        // Log override context inside PolicyGuard node
        setMeshSteps(prev => ({
          ...prev,
          policy_guard: {
            ...prev.policy_guard,
            status: 'success',
            output: `${prev.policy_guard.output}\n\n✓ VP COMPLIANCE OVERRIDE APPROVED BY SARAH JENKINS:\n"${input}"`
          }
        }))
        setShowIntervention(false)
        
        // Execute parallel backend sync actions
        await fireInteractiveExecutionLayer(nexusResult.runId, nexusResult.lead_intel, nexusResult.policy_result)
      } else {
        setNexusResult(res)
        setShowIntervention(false)
        await loadDashboardData()
      }
    } catch (error) {
      console.error('Failed to resolve exception:', error)
      alert('Failed to resolve exception')
    } finally {
      setNexusBusy(false)
    }
  }

  const latestIngestion = useMemo(() => ingestionResult, [ingestionResult])

  const loadDashboardData = async () => {
    try {
      const [logRes, metricRes] = await Promise.all([
        apiClient.get<Record<string, unknown>[]>('/api/v1/nexus/logs').catch(() => []),
        apiClient.get<Record<string, unknown>>('/api/v1/nexus/metrics').catch(() => null),
      ])
      setLogs(logRes || [])
      setMetrics(metricRes)
    } catch {
      setLogs([])
      setMetrics(null)
    }
  }

  useEffect(() => {
    const cached = window.localStorage.getItem('aegis:last-ingestion-result')
    if (cached) {
      try {
        setIngestionResult(JSON.parse(cached))
      } catch {
        // ignore stale cache
      }
    }

    loadDashboardData()
    const intervalId = setInterval(loadDashboardData, 3000)

    const handleIngestionUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail as Record<string, unknown> | undefined
      if (detail) {
        setIngestionResult(detail)
      }
      loadDashboardData()
    }

    window.addEventListener('aegis:ingestion-updated', handleIngestionUpdate)
    return () => {
      clearInterval(intervalId)
      window.removeEventListener('aegis:ingestion-updated', handleIngestionUpdate)
    }
  }, [])

  const uploadPolicies = async () => {
    if (!policyFiles.policy || !policyFiles.sop || !policyFiles.hierarchy) {
      alert('Select all three policy files first.')
      return
    }

    setBusy(true)
    loadDashboardData()
    try {
      const form = new FormData()
      form.append('sales_policy_file', policyFiles.policy)
      form.append('pipeline_sop_file', policyFiles.sop)
      form.append('org_hierarchy_file', policyFiles.hierarchy)

      const res = await apiClient.post<Record<string, unknown>>('/api/v1/nexus/ingest-knowledge', form)
      setIngestionResult(res)
      
      const configToUse = res.data?.summaries || res.data || res
      setNexusGuardrails(JSON.stringify(configToUse, null, 2))

      window.localStorage.setItem('aegis:last-ingestion-result', JSON.stringify(res))
      window.dispatchEvent(new CustomEvent('aegis:ingestion-updated', { detail: res }))
      await loadDashboardData()
    } catch (error) {
      const responseBody = error instanceof Error ? (error as any).response?.body : null
      const fallback = responseBody || { error: error instanceof Error ? error.message : 'Policy sync failed' }
      setIngestionResult(fallback)
      window.localStorage.setItem('aegis:last-ingestion-result', JSON.stringify(fallback))
      window.dispatchEvent(new CustomEvent('aegis:ingestion-updated', { detail: fallback }))
    } finally {
      setBusy(false)
    }
  }

  const runOrchestrator = async () => {
    if (!transcript.trim()) {
      alert('Paste a transcript first.')
      return
    }

    setBusy(true)
    loadDashboardData()
    try {
      const res = await apiClient.post<Record<string, unknown>>('/api/v1/nexus/orchestrate', { transcript })
      setOrchestrateResult(res)
      await loadDashboardData()
    } catch (error) {
      const responseBody = error instanceof Error ? (error as any).response?.body : null
      setOrchestrateResult(responseBody || { error: error instanceof Error ? error.message : 'Orchestration failed' })
      await loadDashboardData()
    } finally {
      setBusy(false)
    }
  }

  const runWorkflow = async (
    key: string,
    workflowId: string,
    inputs: Record<string, string>,
    files?: Record<string, File>
  ) => {
    setBusy(true)
    setActiveWorkflow(key)
    loadDashboardData()
    try {
      const form = new FormData()
      form.append('workflowId', workflowId)

      Object.entries(inputs).forEach(([inputKey, value]) => {
        form.append(`inputs[${inputKey}]`, value)
      })

      Object.entries(files || {}).forEach(([inputKey, file]) => {
        form.append(`inputs[${inputKey}]`, file)
      })

      const res = await apiClient.post<Record<string, unknown>>('/api/v1/nexus/workflows/execute', form)
      setOperatorResults((prev) => ({ ...prev, [key]: res }))
      await loadDashboardData()
    } catch (error) {
      const responseBody = error instanceof Error ? (error as any).response?.body : null
      setOperatorResults((prev) => ({
        ...prev,
        [key]: responseBody || { error: error instanceof Error ? error.message : 'Workflow failed' },
      }))
      await loadDashboardData()
    } finally {
      setBusy(false)
      setActiveWorkflow(null)
    }
  }

  // Full pipeline execution: Knowledge Ingestion → CRM Ops → Nexus Orchestrator
  const runFullPipeline = async () => {
    if (!policyFiles.policy || !policyFiles.sop || !policyFiles.hierarchy) {
      alert('Please select all three policy files first')
      return
    }

    if (!prospectName.trim() || !dealSize.trim() || !dealStage.trim()) {
      alert('Please fill in Prospect Name, Deal Size, and Stage')
      return
    }

    setBusy(true)
    setPipelineStep('knowledge-ingestion')
    setPipelineResults({})
    loadDashboardData()

    try {
      // Step 1: Knowledge Ingestion
      console.log('Step 1: Running Knowledge Ingestion...')
      const ingestionForm = new FormData()
      ingestionForm.append('sales_policy_file', policyFiles.policy)
      ingestionForm.append('pipeline_sop_file', policyFiles.sop)
      ingestionForm.append('org_hierarchy_file', policyFiles.hierarchy)

      const ingestionRes = await apiClient.post<Record<string, unknown>>('/api/v1/nexus/ingest-knowledge', ingestionForm)
      setPipelineResults((prev) => ({ ...prev, 'knowledge-ingestion': ingestionRes }))
      window.localStorage.setItem('aegis:last-ingestion-result', JSON.stringify(ingestionRes))

      // Step 2: CRM Ops (using ingestion output)
      setPipelineStep('crm-ops')
      console.log('Step 2: Running CRM Ops...')
      const crmForm = new FormData()
      crmForm.append('workflowId', '019e307e-2f53-7000-a9c8-25ae89119cf9')
      crmForm.append('inputs[Prospect_Name]', prospectName)
      crmForm.append('inputs[Deal_Size]', dealSize)
      crmForm.append('inputs[Stage]', dealStage)

      const crmRes = await apiClient.post<Record<string, unknown>>('/api/v1/nexus/workflows/execute', crmForm)
      setPipelineResults((prev) => ({ ...prev, 'crm-ops': crmRes }))

      // Step 3: Nexus Orchestrator (using both outputs)
      setPipelineStep('nexus-orchestrator')
      console.log('Step 3: Running Nexus Orchestrator...')

      // Extract transcript from ingestion or use a default
      const salesTranscript = prospectName ? `Prospect: ${prospectName}, Deal Size: $${dealSize}, Stage: ${dealStage}` : 'Sales interaction'
      const policyGuardrails = JSON.stringify(ingestionRes).substring(0, 500) // Use ingestion output as policy guardrails

      const nexusForm = new FormData()
      nexusForm.append('workflowId', '019e31ba-2a0a-7000-b80b-e9e4bd6889f2')
      nexusForm.append('inputs[sales_transcript]', salesTranscript)
      nexusForm.append('inputs[policy_guardrails]', policyGuardrails)

      const nexusRes = await apiClient.post<Record<string, unknown>>('/api/v1/nexus/workflows/execute', nexusForm)
      setPipelineResults((prev) => ({ ...prev, 'nexus-orchestrator': nexusRes }))

      setPipelineStep('complete')
      await loadDashboardData()
    } catch (error) {
      console.error('Pipeline error:', error)
      const errorMsg = error instanceof Error ? error.message : 'Pipeline execution failed'
      setPipelineResults((prev) => ({ ...prev, error: errorMsg }))
    } finally {
      setBusy(false)
    }
  }


  const runDedicatedNexus = async () => {
    if (!nexusTranscript.trim()) {
      alert('Please paste a sales transcript first.')
      return
    }

    if (engineMode === 'interactive') {
      await runInteractiveMeshOrchestrator()
    } else {
      setNexusBusy(true)
      loadDashboardData()
      try {
        // Direct call to our robust AI orchestrator endpoint
        const res = await apiClient.post<Record<string, unknown>>('/api/v1/nexus/orchestrate', {
          transcript: nexusTranscript
        })
        setNexusResult(res)
        await loadDashboardData()
      } catch (error) {
        console.error('Nexus error:', error)
        const responseBody = error instanceof Error ? (error as any).response?.body : null
        setNexusResult(responseBody || { error: error instanceof Error ? error.message : 'Nexus analysis failed' })
      } finally {
        setNexusBusy(false)
      }
    }
  }

  return (
    <main className='min-h-screen bg-[radial-gradient(circle_at_top_left,_#f9fafb,_#eef2ff_45%,_#ffffff_100%)] px-4 py-6 sm:px-6 lg:px-8'>
      <div className='mx-auto max-w-7xl space-y-6'>

        <InterventionModal 
          isOpen={showIntervention} 
          onClose={() => setShowIntervention(false)} 
          runId={String(nexusResult?.runId || '')} 
          message={String(nexusResult?.message || '')} 
          onSubmit={handleResolveException} 
        />

        <header className='rounded-3xl border border-slate-800 bg-slate-950 px-8 py-10 text-white shadow-2xl shadow-slate-950/20 relative overflow-hidden'>
          <div className='absolute inset-0 bg-[radial-gradient(circle_at_top_right,_#1e1b4b,_transparent_45%)] opacity-80' />
          <div className='relative flex flex-wrap items-start justify-between gap-8 z-10'>
            <div className='max-w-3xl space-y-4'>
              <div className='inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/80 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.24em] text-blue-400'>
                <Icons.workbench className='h-4 w-4 text-blue-400' />
                VP Revenue Command Console
              </div>
              <div>
                <h1 className='text-4xl font-extrabold tracking-tight sm:text-5xl bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent'>
                  Sarah Jenkins — Sales & Margin Oversight
                </h1>
                <p className='mt-4 max-w-2xl text-sm text-slate-400 sm:text-base leading-relaxed'>
                  Ingest strategic policies, monitor the automated Supervity AgentMesh pipeline, and authorize custom enterprise pricing or SLA overrides in real-time.
                </p>
                <div className='mt-6 flex flex-wrap gap-4 text-xs font-medium'>
                  <span className='inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1 text-emerald-400 border border-emerald-500/20'>
                    <span className='h-2 w-2 rounded-full bg-emerald-400 animate-ping' />
                    Zoho CRM Sync: Connected
                  </span>
                  <span className='inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1 text-emerald-400 border border-emerald-500/20'>
                    <span className='h-2 w-2 rounded-full bg-emerald-400 animate-ping' />
                    Supervity AgentMesh: Active
                  </span>
                  <span className='inline-flex items-center gap-1.5 rounded-lg bg-blue-500/10 px-3 py-1 text-blue-400 border border-blue-500/20'>
                    Corporate Rules: 2026 Updated
                  </span>
                </div>
              </div>
            </div>

            <div className='grid gap-4 w-full sm:min-w-[400px] sm:w-auto grid-cols-2'>
              <div className='rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-inner backdrop-blur-md'>
                <p className='text-xs font-bold uppercase tracking-wider text-slate-500'>Estimated Margin Saved</p>
                <p className='mt-2 text-3xl font-extrabold text-white'>
                  {metrics ? `${metrics.margin_protected_pct ?? '12.4'}%` : '12.4%'}
                </p>
                <p className='mt-1 text-[10px] text-emerald-400 font-semibold'>✓ Rogue discount protection</p>
              </div>
              <div className='rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-inner backdrop-blur-md'>
                <p className='text-xs font-bold uppercase tracking-wider text-slate-500'>SDR & AE Admin Hours Saved</p>
                <p className='mt-2 text-3xl font-extrabold text-white'>
                  {metrics ? `${metrics.administrative_hours_saved ?? '480'}h` : '480h'}
                </p>
                <p className='mt-1 text-[10px] text-blue-400 font-semibold'>✓ Automated CRM & contracts</p>
              </div>
            </div>
          </div>
        </header>

        <div className='mb-4 flex items-center justify-end gap-2'>
           <Switch checked={debugMode} onCheckedChange={setDebugMode} id='debug-mode' />
           <label htmlFor='debug-mode' className='text-sm font-medium text-slate-600'>Developer Trace</label>
        </div>
        <div className='grid gap-6 lg:grid-cols-12'>
          <div className='space-y-6 lg:col-span-8'>
            {/* Nexus Orchestrator - Deal Intelligence */}
            <Panel
              title='VP Revenue Command Hub'
              description='Direct sales transcript analysis with live RAG policy validation and automated Zoho deal updates.'
            >
              <div className='space-y-4'>
                {/* Advanced Engine Coordinator Selector Toggle */}
                <div className='flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-indigo-100 bg-indigo-50/30 p-4'>
                  <div>
                    <h4 className='text-xs font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5'>
                      🌐 Pipeline Execution Engine
                    </h4>
                    <p className='text-[11px] text-indigo-700 mt-0.5 leading-relaxed'>
                      {engineMode === 'interactive' 
                        ? 'Frontend Orchestrator Mode: Traces individual Claude & Guardrail steps with full visibility.' 
                        : 'Backend Orchestrator Mode: Traces unified endpoint execution with server-side parsing.'}
                    </p>
                  </div>
                  <div className='flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm'>
                    <button
                      type='button'
                      onClick={() => setEngineMode('interactive')}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200',
                        engineMode === 'interactive' 
                          ? 'bg-indigo-600 text-white shadow-sm' 
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      )}
                    >
                      Interactive Mesh
                    </button>
                    <button
                      type='button'
                      onClick={() => setEngineMode('backend')}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200',
                        engineMode === 'backend' 
                          ? 'bg-slate-800 text-white shadow-sm' 
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      )}
                    >
                      Backend Direct
                    </button>
                  </div>
                </div>

                {/* 1. Policy Document Ingestion (First Thing any VP does) */}
                <div className='rounded-2xl border border-blue-100 bg-blue-50/20 p-5 shadow-sm space-y-4'>
                  <div className='flex items-center justify-between border-b border-blue-100/50 pb-3'>
                    <div>
                      <h4 className='text-xs font-bold uppercase tracking-wider text-blue-900 flex items-center gap-1.5'>
                        📁 STEP 1: INGEST CORPORATE POLICIES (KNOWLEDGE BASE)
                      </h4>
                      <p className='text-[11px] text-blue-700 mt-0.5 leading-relaxed'>
                        Upload your business policies, pipeline SOPs, and organizational hierarchies to automatically align our multi-agent framework.
                      </p>
                    </div>
                    {ingestionResult && (
                      <span className='rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700 animate-pulse'>
                        ✓ Active Policy Loaded
                      </span>
                    )}
                  </div>

                  <div className='grid gap-4 md:grid-cols-3'>
                    <div className='flex flex-col gap-1.5'>
                      <label className='text-xs font-bold text-slate-600 flex items-center gap-1'>
                        ⚖️ Sales Discount Policy
                      </label>
                      <div className='relative flex items-center bg-white border border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2 cursor-pointer shadow-sm transition'>
                        <input 
                          type='file' 
                          accept='.pdf,.txt,.doc,.docx' 
                          className='absolute inset-0 opacity-0 cursor-pointer w-full' 
                          onChange={(e) => setPolicyFiles((p) => ({ ...p, policy: e.target.files?.[0] }))} 
                        />
                        <span className='text-xs font-medium text-slate-500 truncate'>
                          {policyFiles.policy ? `📄 ${policyFiles.policy.name}` : 'Choose Sales Policy file'}
                        </span>
                      </div>
                    </div>

                    <div className='flex flex-col gap-1.5'>
                      <label className='text-xs font-bold text-slate-600 flex items-center gap-1'>
                        🛠️ Pipeline SOP Rules
                      </label>
                      <div className='relative flex items-center bg-white border border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2 cursor-pointer shadow-sm transition'>
                        <input 
                          type='file' 
                          accept='.pdf,.txt,.doc,.docx' 
                          className='absolute inset-0 opacity-0 cursor-pointer w-full' 
                          onChange={(e) => setPolicyFiles((p) => ({ ...p, sop: e.target.files?.[0] }))} 
                        />
                        <span className='text-xs font-medium text-slate-500 truncate'>
                          {policyFiles.sop ? `📄 ${policyFiles.sop.name}` : 'Choose SOP Rules file'}
                        </span>
                      </div>
                    </div>

                    <div className='flex flex-col gap-1.5'>
                      <label className='text-xs font-bold text-slate-600 flex items-center gap-1'>
                        👥 Org Hierarchy
                      </label>
                      <div className='relative flex items-center bg-white border border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2 cursor-pointer shadow-sm transition'>
                        <input 
                          type='file' 
                          accept='.pdf,.txt,.doc,.docx' 
                          className='absolute inset-0 opacity-0 cursor-pointer w-full' 
                          onChange={(e) => setPolicyFiles((p) => ({ ...p, hierarchy: e.target.files?.[0] }))} 
                        />
                        <span className='text-xs font-medium text-slate-500 truncate'>
                          {policyFiles.hierarchy ? `📄 ${policyFiles.hierarchy.name}` : 'Choose Hierarchy file'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className='flex items-center gap-3 pt-2'>
                    <button
                      type='button'
                      onClick={async () => {
                        if (!policyFiles.policy || !policyFiles.sop || !policyFiles.hierarchy) {
                          alert('Please select all three files (Sales Policy, SOP, and Org Hierarchy) first.')
                          return
                        }
                        setNexusBusy(true)
                        try {
                          const form = new FormData()
                          form.append('sales_policy_file', policyFiles.policy)
                          form.append('pipeline_sop_file', policyFiles.sop)
                          form.append('org_hierarchy_file', policyFiles.hierarchy)
                          
                          const res = await apiClient.post<Record<string, any>>('/api/v1/nexus/ingest-knowledge', form)
                          setIngestionResult(res)
                          
                          const configToUse = res.data?.summaries || res.data || res
                          setNexusGuardrails(JSON.stringify(configToUse, null, 2))
                          
                          alert('Corporate Policies Ingested & Synced successfully! Alignment rules are now live.')
                        } catch (err) {
                          console.error(err)
                          alert('Failed to ingest corporate policies. Please try again.')
                        } finally {
                          setNexusBusy(false)
                        }
                      }}
                      disabled={nexusBusy}
                      className='inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-500/10 hover:bg-blue-500 transition disabled:opacity-60'
                    >
                      {nexusBusy ? (
                        <>
                          <Icons.activity className='h-3.5 w-3.5 animate-spin' />
                          Parsing Knowledge base...
                        </>
                      ) : (
                        <>
                          <Icons.upload className='h-3.5 w-3.5' />
                          Ingest & Sync Active Corporate Policies
                        </>
                      )}
                    </button>
                    {ingestionResult && (
                      <span className='text-[11px] text-slate-500 font-medium'>
                        Last Ingested: {new Date().toLocaleTimeString()}
                      </span>
                    )}
                  </div>

                  {nexusGuardrails && (
                    <div className='mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 transition-all duration-300'>
                      <div className='flex items-center justify-between mb-2'>
                        <span className='text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5'>
                          <span className='h-2 w-2 rounded-full bg-emerald-500 animate-pulse' />
                          Active Ingested Policy JSON
                        </span>
                        <button
                          type='button'
                          onClick={() => {
                            navigator.clipboard.writeText(nexusGuardrails)
                            alert('Policy JSON copied to clipboard!')
                          }}
                          className='inline-flex items-center gap-1 rounded bg-slate-200 hover:bg-slate-300 px-2 py-1 text-[11px] font-bold text-slate-700 transition'
                        >
                          <Icons.copy className='h-3 w-3' />
                          Copy JSON
                        </button>
                      </div>
                      <pre className='text-xs text-slate-600 font-mono bg-white border border-slate-100 p-3 rounded-lg overflow-x-auto max-h-48 leading-relaxed shadow-inner select-all'>
                        {nexusGuardrails}
                      </pre>
                    </div>
                  )}
                </div>

                <div className='grid gap-4 md:grid-cols-2'>
                  <div className='flex flex-col gap-2'>
                    <div className='flex items-center justify-between'>
                      <label className='text-sm font-semibold text-slate-700'>Live Sales Transcript</label>
                      <div className='flex gap-1.5'>
                        <button
                          type='button'
                          onClick={() => {
                            setNexusTranscript(SAMPLE_SUCCESS_TRANSCRIPT)
                          }}
                          className='rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 border border-blue-200 hover:bg-blue-100 transition'
                        >
                          Load Compliant Deal
                        </button>
                        <button
                          type='button'
                          onClick={() => {
                            setNexusTranscript(SAMPLE_VIOLATION_TRANSCRIPT)
                          }}
                          className='rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 border border-amber-200 hover:bg-amber-100 transition'
                        >
                          Load Exception Deal
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={nexusTranscript}
                      onChange={(e) => setNexusTranscript(e.target.value)}
                      rows={12}
                      className='w-full rounded-xl border border-slate-200 bg-white p-4 text-sm font-medium outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 shadow-sm leading-relaxed'
                      placeholder='Paste or load the sales meeting transcript or notes here to evaluate...'
                    />
                  </div>
                  <div className='flex flex-col gap-2'>
                    <label className='text-sm font-semibold text-slate-700'>Policy Guardrails (RAG Context)</label>
                    <textarea
                      value={nexusGuardrails}
                      onChange={(e) => setNexusGuardrails(e.target.value)}
                      rows={12}
                      className='w-full rounded-xl border border-slate-200 bg-white p-4 text-sm font-medium outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 shadow-sm leading-relaxed'
                      placeholder='Enter custom guardrails here (defaults to active ingested policies)...'
                    />
                  </div>
                </div>

                <AgentMesh 
                  status={nexusBusy ? 'PROCESSING' : nexusResult?.status || (nexusResult ? 'COMPLETE' : null)} 
                  engineMode={engineMode} 
                  meshSteps={meshSteps} 
                />
                <div className='flex items-center gap-3'>
                  <button
                    onClick={runDedicatedNexus}
                    disabled={nexusBusy}
                    className='inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-500 disabled:opacity-60'
                  >
                    {nexusBusy ? (
                      <>
                        <Icons.activity className='h-4 w-4 animate-spin' />
                        Analyzing Intelligence...
                      </>
                    ) : (
                      <>
                        <Icons.sparkles className='h-4 w-4' />
                        Execute Aegis Pipeline
                      </>
                    )}
                  </button>
                  <span className='hidden text-sm text-slate-500 sm:inline'>
                    Extracts intent scores, battlecards, and recommendations.
                  </span>
                </div>

                {nexusResult && (() => {
                  const leadIntel = (nexusResult.lead_intel as any) || {}
                  const policyResult = (nexusResult.policy_result as any) || {}
                  const intentScore = Number(leadIntel.intent_score ?? nexusResult.intent_score ?? nexusResult.score ?? 85)
                  const intentLabel = String(leadIntel.intent_label ?? 'High Interest')
                  const isCompliant = policyResult.compliant !== false && nexusResult.status !== 'WAITING_FOR_INPUT'
                  const riskScore = Number(policyResult.risk_score ?? 0)
                  
                  const battlecard = leadIntel.battlecard || {}
                  const objections = Array.isArray(battlecard.top_pain_points) 
                    ? battlecard.top_pain_points.join(', ') 
                    : String(nexusResult.objections || 'None detected in this segment.')
                  const recommendedApproach = String(battlecard.recommended_approach || nexusResult.recommendations || nexusResult.battlecard || 'Proceed with standard enterprise pricing.')

                  return (
                    <div className='mt-8 space-y-6'>
                      {/* High-Impact Observability Cards */}
                      <div className='grid gap-4 sm:grid-cols-3'>
                        <div className='rounded-2xl border border-emerald-100 bg-emerald-50 p-6'>
                          <h4 className='text-xs font-bold uppercase tracking-widest text-emerald-600'>Intent Score</h4>
                          <div className='mt-2 flex items-baseline gap-2'>
                            <span className='text-4xl font-black text-emerald-900'>
                              {intentScore}
                            </span>
                            <span className='text-sm font-medium text-emerald-600'>/ 100</span>
                          </div>
                          <p className='mt-2 text-xs text-emerald-700'>
                            {intentLabel} conviction detected based on budget & timeline analysis.
                          </p>
                        </div>

                        <div className='rounded-2xl border border-blue-100 bg-blue-50 p-6'>
                          <h4 className='text-xs font-bold uppercase tracking-widest text-blue-600'>Deal Heat</h4>
                          <div className='mt-2 h-2 w-full rounded-full bg-blue-200'>
                            <div className='h-2 rounded-full bg-blue-600 transition-all duration-500' style={{ width: `${intentScore}%` }} />
                          </div>
                          <p className='mt-4 text-sm font-semibold text-blue-900'>Advancing ({intentScore}%)</p>
                          <p className='mt-1 text-xs text-blue-700'>Probability of closing within target timeline.</p>
                        </div>

                        <div className={cn(
                          'rounded-2xl border p-6 transition-all duration-300',
                          isCompliant 
                            ? 'border-emerald-100 bg-emerald-50' 
                            : 'border-rose-100 bg-rose-50 shadow-[0_0_15px_rgba(244,63,94,0.1)]'
                        )}>
                          <h4 className={cn(
                            'text-xs font-bold uppercase tracking-widest',
                            isCompliant ? 'text-emerald-600' : 'text-rose-600 animate-pulse'
                          )}>
                            Compliance
                          </h4>
                          <div className='mt-2 flex items-center gap-2'>
                            <Icons.shield className={cn('h-6 w-6', isCompliant ? 'text-emerald-600' : 'text-rose-600')} />
                            <span className={cn('text-2xl font-bold', isCompliant ? 'text-emerald-900' : 'text-rose-900')}>
                              {isCompliant ? 'Compliant' : 'Violation Block'}
                            </span>
                          </div>
                          <p className={cn('mt-3 text-xs', isCompliant ? 'text-emerald-700' : 'text-rose-700')}>
                            {isCompliant 
                              ? `All terms clear. Risk score is very low (${riskScore}/100).` 
                              : `Deal has flagged compliance warnings. Review required.`}
                          </p>
                        </div>
                      </div>

                      {/* Human Readable AI Result */}
                      <div className='space-y-4'>
                        <div className='flex items-center gap-2'>
                          <Icons.search className='h-5 w-5 text-slate-400' />
                          <h3 className='font-bold text-slate-900'>Executive Insights</h3>
                        </div>
                        <ReadableOutput value={nexusResult} />
                      </div>

                      {/* Battlecard Section */}
                      <div className='rounded-2xl border border-slate-200 bg-slate-900 p-6 text-white'>
                        <div className='mb-4 flex items-center gap-2'>
                          <Icons.fileText className='h-5 w-5 text-blue-400' />
                          <h4 className='text-lg font-bold'>Sales Battlecard</h4>
                        </div>
                        <div className='grid gap-4 md:grid-cols-2'>
                          <div>
                            <h5 className='text-xs font-bold uppercase text-slate-400'>Key Objections / Pain Points</h5>
                            <p className='mt-2 text-sm leading-relaxed text-slate-200'>
                              {objections}
                            </p>
                          </div>
                          <div>
                            <h5 className='text-xs font-bold uppercase text-slate-400'>Recommended Approach / Strategy</h5>
                            <p className='mt-2 text-sm leading-relaxed text-slate-200'>
                              {recommendedApproach}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </Panel>
            {/* The Engine Room (The Dropdown) */}
            <details className='group rounded-2xl border border-slate-200 bg-white/90 shadow-sm backdrop-blur [&_summary::-webkit-details-marker]:hidden'>
              <summary className='flex cursor-pointer items-center justify-between p-5 font-semibold text-slate-900 outline-none'>
                Advanced Operator Controls
                <span className='transition-transform group-open:rotate-180'>▼</span>
              </summary>
              <div className='space-y-6 border-t border-slate-200 p-5'>
            {/* Full Pipeline Section */}
            <Panel
              title='Full Sales Pipeline'
              description='Automated workflow: Ingest policies → Qualify deal with CRM → Get orchestrator recommendation'
            >
              <div className='grid gap-4 md:grid-cols-3'>
                <label className='space-y-2 text-sm'>
                  <span className='font-medium text-slate-700'>Sales Policy</span>
                  <input type='file' accept='.pdf,.txt,.doc,.docx' className='block w-full text-sm' onChange={(e) => setPolicyFiles((p) => ({ ...p, policy: e.target.files?.[0] }))} />
                </label>
                <label className='space-y-2 text-sm'>
                  <span className='font-medium text-slate-700'>Pipeline SOP</span>
                  <input type='file' accept='.pdf,.txt,.doc,.docx' className='block w-full text-sm' onChange={(e) => setPolicyFiles((p) => ({ ...p, sop: e.target.files?.[0] }))} />
                </label>
                <label className='space-y-2 text-sm'>
                  <span className='font-medium text-slate-700'>Org Hierarchy</span>
                  <input type='file' accept='.pdf,.txt,.doc,.docx' className='block w-full text-sm' onChange={(e) => setPolicyFiles((p) => ({ ...p, hierarchy: e.target.files?.[0] }))} />
                </label>
              </div>

              <div className='mt-4 grid gap-3 md:grid-cols-3'>
                <input
                  type='text'
                  value={prospectName}
                  onChange={(e) => setProspectName(e.target.value)}
                  placeholder='Prospect Name'
                  className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400'
                />
                <input
                  type='text'
                  value={dealSize}
                  onChange={(e) => setDealSize(e.target.value)}
                  placeholder='Deal Size ($)'
                  className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400'
                />
                <input
                  type='text'
                  value={dealStage}
                  onChange={(e) => setDealStage(e.target.value)}
                  placeholder='Stage (e.g., Discovery)'
                  className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400'
                />
              </div>

              <div className='mt-4 flex items-center gap-3'>
                <button
                  onClick={runFullPipeline}
                  disabled={busy}
                  className='inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60'
                >
                  <Icons.sparkles className='h-4 w-4' />
                  {pipelineStep === 'idle' ? 'Start Pipeline' : `Running: ${pipelineStep.replace(/-/g, ' ')}`}
                </button>
                {pipelineStep !== 'idle' && (
                  <span className='text-sm text-slate-500'>
                    {pipelineStep === 'complete' ? '✓ Pipeline complete' : '⏳ Processing...'}
                  </span>
                )}
              </div>

              {Object.keys(pipelineResults).length > 0 && (
                <div className='mt-6 space-y-4'>
                  <div className='border-t border-slate-200 pt-4'>
                    <h3 className='font-semibold text-slate-900 mb-3'>Pipeline Results</h3>

                    {pipelineResults['knowledge-ingestion'] && (
                      <div className='mb-4'>
                        <div className='flex items-center gap-2 mb-2'>
                          <div className='h-2 w-2 rounded-full bg-emerald-500' />
                          <h4 className='font-medium text-slate-700'>Knowledge Ingestion</h4>
                        </div>
                        <ReadableOutput value={pipelineResults['knowledge-ingestion']} />
                      </div>
                    )}

                    {pipelineResults['crm-ops'] && (
                      <div className='mb-4'>
                        <div className='flex items-center gap-2 mb-2'>
                          <div className='h-2 w-2 rounded-full bg-emerald-500' />
                          <h4 className='font-medium text-slate-700'>CRM Operations</h4>
                        </div>
                        <ReadableOutput value={pipelineResults['crm-ops']} />
                      </div>
                    )}

                    {pipelineResults['nexus-orchestrator'] && (
                      <div className='mb-4'>
                        <div className='flex items-center gap-2 mb-2'>
                          <div className='h-2 w-2 rounded-full bg-emerald-500' />
                          <h4 className='font-medium text-slate-700'>Nexus Orchestrator</h4>
                        </div>
                        <ReadableOutput value={pipelineResults['nexus-orchestrator']} />
                      </div>
                    )}

                    {pipelineResults.error && (
                      <div className='rounded-2xl border border-red-200 bg-red-50 p-4'>
                        <p className='text-sm text-red-900'>{pipelineResults.error}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Panel>
            <Panel
              title='Policy sync'
              description='Use Settings to ingest the three source documents. The JSON response is now broadcast here automatically.'
            >
              <div className='grid gap-3 sm:grid-cols-3'>
                <label className='space-y-2 text-sm'>
                  <span className='font-medium text-slate-700'>Sales policy</span>
                  <input type='file' accept='.pdf,.txt,.doc,.docx' className='block w-full text-sm' onChange={(e) => setPolicyFiles((p) => ({ ...p, policy: e.target.files?.[0] }))} />
                </label>
                <label className='space-y-2 text-sm'>
                  <span className='font-medium text-slate-700'>Pipeline SOP</span>
                  <input type='file' accept='.pdf,.txt,.doc,.docx' className='block w-full text-sm' onChange={(e) => setPolicyFiles((p) => ({ ...p, sop: e.target.files?.[0] }))} />
                </label>
                <label className='space-y-2 text-sm'>
                  <span className='font-medium text-slate-700'>Org hierarchy</span>
                  <input type='file' accept='.pdf,.txt,.doc,.docx' className='block w-full text-sm' onChange={(e) => setPolicyFiles((p) => ({ ...p, hierarchy: e.target.files?.[0] }))} />
                </label>
              </div>
              <div className='mt-4 flex items-center gap-3'>
                <button
                  onClick={uploadPolicies}
                  disabled={busy}
                  className='inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60'
                >
                  <Icons.upload className='h-4 w-4' />
                  Sync with Supervity
                </button>
                <span className='text-sm text-slate-500'>Uploads the three documents and stores the JSON response.</span>
              </div>
              {latestIngestion && (
                <div className='mt-4'>
                  {debugMode ? (
                    <JsonBlock value={latestIngestion} />
                  ) : (
                    <div className='flex items-center gap-2 text-emerald-600'>✓ Processing complete</div>
                  )}
                </div>
              )}
            </Panel>
            <Panel
              title='Operator mesh'
              description='Run the documented agents directly. This removes the blender and shows each operator response in place.'
            >
              <div className='grid gap-4 md:grid-cols-2'>
                <div className='rounded-2xl border border-slate-200 bg-slate-50 p-4'>
                  <div className='mb-3 flex items-center justify-between gap-3'>
                    <div>
                      <h3 className='font-semibold text-slate-900'>Lead Intel Ops</h3>
                      <p className='text-xs text-slate-500'>Qualify and enrich inbound leads.</p>
                    </div>
                    <Icons.users className='h-5 w-5 text-slate-500' />
                  </div>
                  <div className='space-y-2 text-sm'>
                    <input id='lead-name' className='w-full rounded-lg border border-slate-200 bg-white px-3 py-2' placeholder='Prospect Name' />
                    <input id='lead-company' className='w-full rounded-lg border border-slate-200 bg-white px-3 py-2' placeholder='Company Name' />
                    <textarea id='lead-activity' className='w-full rounded-lg border border-slate-200 bg-white px-3 py-2' rows={3} placeholder='Inbound activity log' />
                    <button
                      className='rounded-xl bg-slate-950 px-3 py-2 text-white disabled:opacity-60'
                      disabled={busy && activeWorkflow === 'lead-intel'}
                      onClick={() => runWorkflow(
                        'lead-intel',
                        '019e3095-3378-7000-81f1-6f5dfee4b6ea',
                        {
                          prospect_name: (document.getElementById('lead-name') as HTMLInputElement)?.value || '',
                          company_name: (document.getElementById('lead-company') as HTMLInputElement)?.value || '',
                          inbound_activity_log: (document.getElementById('lead-activity') as HTMLTextAreaElement)?.value || '',
                        }
                      )}
                    >
                      Run Lead Intel
                    </button>
                  </div>
                  {operatorResults['lead-intel'] && <div className='mt-3'>{debugMode ? <JsonBlock value={operatorResults['lead-intel']} /> : <ReadableOutput value={operatorResults['lead-intel']} />}</div>}
                </div>

                <div className='rounded-2xl border border-slate-200 bg-slate-50 p-4'>
                  <div className='mb-3 flex items-center justify-between gap-3'>
                    <div>
                      <h3 className='font-semibold text-slate-900'>Policy Guard</h3>
                      <p className='text-xs text-slate-500'>Check discounts before a deal advances.</p>
                    </div>
                    <Icons.shield className='h-5 w-5 text-slate-500' />
                  </div>
                  <div className='space-y-2 text-sm'>
                    <input id='guard-name' className='w-full rounded-lg border border-slate-200 bg-white px-3 py-2' placeholder='Prospect Name' />
                    <input id='guard-discount' className='w-full rounded-lg border border-slate-200 bg-white px-3 py-2' placeholder='Requested Discount' />
                    <input id='guard-competitor' className='w-full rounded-lg border border-slate-200 bg-white px-3 py-2' placeholder='Competitor Mentioned' />
                    <input id='guard-terms' className='w-full rounded-lg border border-slate-200 bg-white px-3 py-2' placeholder='Requested Terms' />
                    <button
                      className='rounded-xl bg-slate-950 px-3 py-2 text-white disabled:opacity-60'
                      disabled={busy && activeWorkflow === 'policy-guard'}
                      onClick={() => runWorkflow(
                        'policy-guard',
                        '019e306a-34a6-7000-ab83-01ed37ef91a4',
                        {
                          Prospect_Name: (document.getElementById('guard-name') as HTMLInputElement)?.value || '',
                          Requested_Discount: (document.getElementById('guard-discount') as HTMLInputElement)?.value || '',
                          Competitor_Mentioned: (document.getElementById('guard-competitor') as HTMLInputElement)?.value || '',
                          Requested_Terms: (document.getElementById('guard-terms') as HTMLInputElement)?.value || '',
                        }
                      )}
                    >
                      Run Policy Guard
                    </button>
                  </div>
                  {operatorResults['policy-guard'] && <div className='mt-3'>{debugMode ? <JsonBlock value={operatorResults['policy-guard']} /> : <ReadableOutput value={operatorResults['policy-guard']} />}</div>}
                </div>

                <div className='rounded-2xl border border-slate-200 bg-slate-50 p-4'>
                  <div className='mb-3 flex items-center justify-between gap-3'>
                    <div>
                      <h3 className='font-semibold text-slate-900'>CRM Ops</h3>
                      <p className='text-xs text-slate-500'>Create or update the deal in CRM.</p>
                    </div>
                    <Icons.network className='h-5 w-5 text-slate-500' />
                  </div>
                  <div className='space-y-2 text-sm'>
                    <input id='crm-name' className='w-full rounded-lg border border-slate-200 bg-white px-3 py-2' placeholder='Prospect Name' />
                    <input id='crm-deal-size' className='w-full rounded-lg border border-slate-200 bg-white px-3 py-2' placeholder='Deal Size' />
                    <input id='crm-stage' className='w-full rounded-lg border border-slate-200 bg-white px-3 py-2' placeholder='Stage' />
                    <button
                      className='rounded-xl bg-slate-950 px-3 py-2 text-white disabled:opacity-60'
                      disabled={busy && activeWorkflow === 'crm-ops'}
                      onClick={() => runWorkflow(
                        'crm-ops',
                        '019e307e-2f53-7000-a9c8-25ae89119cf9',
                        {
                          Prospect_Name: (document.getElementById('crm-name') as HTMLInputElement)?.value || '',
                          Deal_Size: (document.getElementById('crm-deal-size') as HTMLInputElement)?.value || '',
                          Stage: (document.getElementById('crm-stage') as HTMLInputElement)?.value || '',
                        }
                      )}
                    >
                      Run CRM Ops
                    </button>
                  </div>
                  {operatorResults['crm-ops'] && <div className='mt-3'>{debugMode ? <JsonBlock value={operatorResults['crm-ops']} /> : <ReadableOutput value={operatorResults['crm-ops']} />}</div>}
                </div>

                <div className='rounded-2xl border border-slate-200 bg-slate-50 p-4'>
                  <div className='mb-3 flex items-center justify-between gap-3'>
                    <div>
                      <h3 className='font-semibold text-slate-900'>Doc Ops</h3>
                      <p className='text-xs text-slate-500'>Generate proposal or battlecard content.</p>
                    </div>
                    <Icons.fileText className='h-5 w-5 text-slate-500' />
                  </div>
                  <div className='space-y-2 text-sm'>
                    <input id='doc-name' className='w-full rounded-lg border border-slate-200 bg-white px-3 py-2' placeholder='Prospect Name' />
                    <input id='doc-deal-size' className='w-full rounded-lg border border-slate-200 bg-white px-3 py-2' placeholder='Deal Size' />
                    <textarea id='doc-battlecard' className='w-full rounded-lg border border-slate-200 bg-white px-3 py-2' rows={3} placeholder='Battlecard / proposal notes' />
                    <button
                      className='rounded-xl bg-slate-950 px-3 py-2 text-white disabled:opacity-60'
                      disabled={busy && activeWorkflow === 'doc-ops'}
                      onClick={() => runWorkflow(
                        'doc-ops',
                        '019e3089-2ae9-7000-90c5-f6e1e1269002',
                        {
                          prospect_name: (document.getElementById('doc-name') as HTMLInputElement)?.value || '',
                          deal_size: (document.getElementById('doc-deal-size') as HTMLInputElement)?.value || '',
                          battlecard: (document.getElementById('doc-battlecard') as HTMLTextAreaElement)?.value || '',
                        }
                      )}
                    >
                      Run Doc Ops
                    </button>
                  </div>
                  {operatorResults['doc-ops'] && <div className='mt-3'>{debugMode ? <JsonBlock value={operatorResults['doc-ops']} /> : <ReadableOutput value={operatorResults['doc-ops']} />}</div>}
                </div>
              </div>
            </Panel>
            <Panel
              title='Lead / deal orchestrator'
              description='Paste a lead summary or call transcript to trigger the agent workflow.'
            >
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={10}
                className='w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm outline-none ring-0 transition focus:border-slate-400'
                placeholder='Example: inbound enterprise lead asks for pricing, discounts, procurement notes, and timeline...'
              />
              <div className='mt-4 flex items-center gap-3'>
                <button
                  onClick={runOrchestrator}
                  disabled={busy}
                  className='inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60'
                >
                  <Icons.sparkles className='h-4 w-4' />
                  Run Supervity Flow
                </button>
                <span className='text-sm text-slate-500'>This is where lead qualification, approvals, and routing start.</span>
              </div>
              {orchestrateResult && (
                <div className='mt-4'>
                  {debugMode ? <JsonBlock value={orchestrateResult} /> : <ReadableOutput value={orchestrateResult} />}
                </div>
              )}
            </Panel>
              </div>
            </details>




          </div>

          <div className='space-y-6 lg:col-span-4'>
            <Panel title='Action Inbox' description='Recent actions written by the backend.'>
              <div className='max-h-[28rem] overflow-auto rounded-2xl border border-slate-200 bg-white'>
                <table className='w-full text-left text-sm'>
                  <thead className='sticky top-0 bg-slate-50 text-slate-500'>
                    <tr>
                      <th className='px-4 py-3 font-medium'>Action</th>
                      <th className='px-4 py-3 font-medium'>Status</th>
                      <th className='px-4 py-3 font-medium'>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 ? (
                      <tr>
                        <td className='px-4 py-6 text-slate-500' colSpan={3}>
                          No logs yet.
                        </td>
                      </tr>
                    ) : (
                      logs.slice(0, 12).map((log, index) => (
                        <tr key={index} className='border-t border-slate-100'>
                          <td className='px-4 py-3 text-slate-800'>{String(log.action ?? 'n/a')}</td>
                          <td className='px-4 py-3'>
                            <span className={`rounded-full px-2 py-1 text-xs font-medium ${log.success ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {log.success ? 'success' : 'pending'}
                            </span>
                          </td>
                          <td className='px-4 py-3 text-slate-500'>
                            {log.timestamp ? formatTimeAgo(String(log.timestamp)) : 'N/A'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title='Active Guardrails' description='Metrics from the backend plus the latest ingestion payload.'>
              <div className='space-y-3 text-sm text-slate-700'>
                <div className='flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3'>
                  <span>Orchestration count</span>
                  <span className='font-semibold'>{String(metrics?.total_orchestrations ?? '0')}</span>
                </div>
                <div className='flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3'>
                  <span>Compliance rate</span>
                  <span className='font-semibold'>{String(metrics?.compliance_rate ?? '0')}%</span>
                </div>
                <div className='flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3'>
                  <span>Hours saved</span>
                  <span className='font-semibold'>{String(metrics?.administrative_hours_saved ?? '0')}</span>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </main>
  )
}

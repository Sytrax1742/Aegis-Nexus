'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiClient } from '@/lib/api-client'
import { Icons } from '@/components/ui/icons'

type IngestionResult = Record<string, unknown> | null
type OrchestrateResult = Record<string, unknown> | null
type OperatorResult = Record<string, unknown> | null
type PipelineStep = 'idle' | 'knowledge-ingestion' | 'crm-ops' | 'nexus-orchestrator' | 'complete'

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
    return JSON.stringify(data, null, 2)
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
  return (
    <pre className='max-h-80 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100'>
      {JSON.stringify(value, null, 2)}
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
  
  // Pipeline state
  const [pipelineStep, setPipelineStep] = useState<PipelineStep>('idle')
  const [pipelineResults, setPipelineResults] = useState<Record<string, any>>({})
  const [prospectName, setProspectName] = useState('')
  const [dealSize, setDealSize] = useState('')
  const [dealStage, setDealStage] = useState('')

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

    const handleIngestionUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail as Record<string, unknown> | undefined
      if (detail) {
        setIngestionResult(detail)
      }
      loadDashboardData()
    }

    window.addEventListener('aegis:ingestion-updated', handleIngestionUpdate)
    return () => window.removeEventListener('aegis:ingestion-updated', handleIngestionUpdate)
  }, [])

  const uploadPolicies = async () => {
    if (!policyFiles.policy || !policyFiles.sop || !policyFiles.hierarchy) {
      alert('Select all three policy files first.')
      return
    }

    setBusy(true)
    try {
      const form = new FormData()
      form.append('sales_policy_file', policyFiles.policy)
      form.append('pipeline_sop_file', policyFiles.sop)
      form.append('org_hierarchy_file', policyFiles.hierarchy)

      const res = await apiClient.post<Record<string, unknown>>('/api/v1/nexus/ingest-knowledge', form)
      setIngestionResult(res)
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

  return (
    <main className='min-h-screen bg-[radial-gradient(circle_at_top_left,_#f9fafb,_#eef2ff_45%,_#ffffff_100%)] px-4 py-6 sm:px-6 lg:px-8'>
      <div className='mx-auto max-w-7xl space-y-6'>
        <header className='rounded-3xl border border-slate-200 bg-slate-950 px-6 py-8 text-white shadow-xl shadow-slate-900/10'>
          <div className='flex flex-wrap items-start justify-between gap-6'>
            <div className='max-w-3xl space-y-4'>
              <div className='inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-slate-300'>
                <Icons.workbench className='h-4 w-4' />
                Sales Command Center
              </div>
              <div>
                <h1 className='text-3xl font-semibold tracking-tight sm:text-5xl'>
                  One place to ingest, qualify, approve, and route every deal.
                </h1>
                <p className='mt-4 max-w-2xl text-sm text-slate-300 sm:text-base'>
                  This is the live Supervity-backed command surface for sales ops. Upload policy docs in Settings, run the orchestrator on transcripts, and watch the results land here.
                </p>
              </div>
            </div>

            <div className='grid gap-3 sm:min-w-80 sm:grid-cols-2'>
              <div className='rounded-2xl border border-white/10 bg-white/5 p-4'>
                <p className='text-xs uppercase tracking-[0.2em] text-slate-400'>Metrics</p>
                <p className='mt-2 text-2xl font-semibold'>{metrics ? 'Live' : 'Loading'}</p>
              </div>
              <div className='rounded-2xl border border-white/10 bg-white/5 p-4'>
                <p className='text-xs uppercase tracking-[0.2em] text-slate-400'>Audit trail</p>
                <p className='mt-2 text-2xl font-semibold'>{logs.length}</p>
              </div>
            </div>
          </div>
        </header>

        <div className='grid gap-6 lg:grid-cols-12'>
          <div className='space-y-6 lg:col-span-7'>
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
                  <JsonBlock value={latestIngestion} />
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
                  {operatorResults['lead-intel'] && <div className='mt-3'><JsonBlock value={operatorResults['lead-intel']} /></div>}
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
                  {operatorResults['policy-guard'] && <div className='mt-3'><JsonBlock value={operatorResults['policy-guard']} /></div>}
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
                  {operatorResults['crm-ops'] && <div className='mt-3'><JsonBlock value={operatorResults['crm-ops']} /></div>}
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
                  {operatorResults['doc-ops'] && <div className='mt-3'><JsonBlock value={operatorResults['doc-ops']} /></div>}
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
                  <JsonBlock value={orchestrateResult} />
                </div>
              )}
            </Panel>
          </div>

          <div className='space-y-6 lg:col-span-5'>
            <Panel title='Live audit trail' description='Recent actions written by the backend.'>
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
                          <td className='px-4 py-3 text-slate-500'>{String(log.timestamp ?? '')}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title='Current policy state' description='Metrics from the backend plus the latest ingestion payload.'>
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
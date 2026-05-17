import re

with open("frontend/src/app/page.tsx", "r") as f:
    content = f.read()

# 1. Add InterventionModal component
modal_code = """
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
"""

if "function InterventionModal" not in content:
    content = content.replace("function AgentMesh", modal_code + "\nfunction AgentMesh")

# 2. Add showIntervention state
if "showIntervention" not in content:
    content = content.replace("const [nexusBusy, setNexusBusy] = useState(false)", "const [nexusBusy, setNexusBusy] = useState(false)\n  const [showIntervention, setShowIntervention] = useState(false)")

# 3. Add useEffect to trigger modal
effect_code = """
  useEffect(() => {
    if (nexusResult?.status === 'WAITING_FOR_INPUT') {
      setShowIntervention(true)
    }
  }, [nexusResult])

  const handleResolveException = async (input: string) => {
    if (!nexusResult?.runId) return
    try {
      setNexusBusy(true)
      const res = await apiClient.post<Record<string, unknown>>('/api/v1/nexus/resolve-exception', {
        runId: nexusResult.runId,
        input_data: { human_input: input }
      })
      setNexusResult(res)
      setShowIntervention(false)
      await loadDashboardData()
    } catch (error) {
      console.error('Failed to resolve exception:', error)
      alert('Failed to resolve exception')
    } finally {
      setNexusBusy(false)
    }
  }
"""
if "handleResolveException" not in content:
    content = content.replace("const latestIngestion = useMemo(() => ingestionResult, [ingestionResult])", effect_code + "\n  const latestIngestion = useMemo(() => ingestionResult, [ingestionResult])")

# 4. Inject Modal into JSX
modal_jsx = """
        <InterventionModal 
          isOpen={showIntervention} 
          onClose={() => setShowIntervention(false)} 
          runId={String(nexusResult?.runId || '')} 
          message={String(nexusResult?.message || '')} 
          onSubmit={handleResolveException} 
        />
"""
if "<InterventionModal" not in content:
    content = content.replace("<div className='mx-auto max-w-7xl space-y-6'>", "<div className='mx-auto max-w-7xl space-y-6'>\n" + modal_jsx)


with open("frontend/src/app/page.tsx", "w") as f:
    f.write(content)

print("Update completed.")

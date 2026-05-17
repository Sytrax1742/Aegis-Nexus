import re

with open("frontend/src/app/page.tsx", "r") as f:
    content = f.read()

# 1. Insert AgentMesh component
agent_mesh_code = """
function AgentMesh({ status }: { status?: string | null }) {
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
      <h3 className='mb-6 text-xs font-bold uppercase tracking-widest text-slate-500'>AgentMesh Orchestrator Pipeline</h3>
      <div className='relative flex items-center justify-between'>
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
"""

if "function AgentMesh" not in content:
    content = content.replace("export default function CommandCenterPage() {", agent_mesh_code + "\nexport default function CommandCenterPage() {")

# 2. Update runDedicatedNexus function
new_run_dedicated_nexus = """  const runDedicatedNexus = async () => {
    if (!nexusTranscript.trim()) {
      alert('Please paste a sales transcript first')
      return
    }

    setNexusBusy(true)
    loadDashboardData()
    try {
      const res = await apiClient.post<Record<string, unknown>>('/api/v1/nexus/orchestrate', { transcript: nexusTranscript })
      setNexusResult(res)
      await loadDashboardData()
    } catch (error) {
      console.error('Nexus error:', error)
      const responseBody = error instanceof Error ? (error as any).response?.body : null
      setNexusResult(responseBody || { error: error instanceof Error ? error.message : 'Nexus analysis failed' })
    } finally {
      setNexusBusy(false)
    }
  }"""

# Use regex to replace the old function
content = re.sub(
    r"  const runDedicatedNexus = async \(\) => \{[\s\S]*?  \}",
    new_run_dedicated_nexus,
    content
)

# 3. Update the button text and add the AgentMesh component
old_button_section = """                <div className='flex items-center gap-3'>
                  <button
                    onClick={runDedicatedNexus}
                    disabled={nexusBusy}
                    className='inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-500 disabled:opacity-60'
                  >
                    {nexusBusy ? (
                      <>
                        <Icons.spinner className='h-4 w-4 animate-spin' />
                        Analyzing Intelligence...
                      </>
                    ) : (
                      <>
                        <Icons.sparkles className='h-4 w-4' />
                        Launch Deal Intelligence
                      </>
                    )}
                  </button>"""

new_button_section = """                <AgentMesh status={nexusBusy ? 'PROCESSING' : nexusResult?.status || (nexusResult ? 'COMPLETE' : null)} />
                <div className='flex items-center gap-3'>
                  <button
                    onClick={runDedicatedNexus}
                    disabled={nexusBusy}
                    className='inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-500 disabled:opacity-60'
                  >
                    {nexusBusy ? (
                      <>
                        <Icons.spinner className='h-4 w-4 animate-spin' />
                        Analyzing Intelligence...
                      </>
                    ) : (
                      <>
                        <Icons.sparkles className='h-4 w-4' />
                        Execute Aegis Pipeline
                      </>
                    )}
                  </button>"""

content = content.replace(old_button_section, new_button_section)

with open("frontend/src/app/page.tsx", "w") as f:
    f.write(content)

print("Update completed.")

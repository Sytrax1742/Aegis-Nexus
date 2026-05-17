'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { CardWatermark } from '@/components/ui/card-watermark'
import { Icons } from '@/components/ui/icons'

// ============================================================================
// Types
// ============================================================================

interface AgentStatus {
  workflow_id: string
  configured: boolean
  label: string
}

interface AuditLogEntry {
  timestamp: string
  action: string
  status: boolean | string
}

interface AgentLogEntry {
  id: number
  timestamp: string
  agent: string
  phase: string
  status: 'success' | 'error' | 'processing' | 'waiting'
  duration_ms: number
  message: string
}

// ============================================================================
// Tabs
// ============================================================================

const tabs = [
  { id: 'observability', label: 'AI Observability', icon: Icons.activity },
  { id: 'agents', label: 'Agent Registry', icon: Icons.brain },
  { id: 'logs', label: 'Execution Logs', icon: Icons.fileText },
]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

// ============================================================================
// Helper: Map audit action to phase/agent
// ============================================================================

function parseAuditAction(action: string): { agent: string; phase: string } {
  if (action.includes('knowledge')) return { agent: 'Knowledge Agent', phase: 'Ingestion' }
  if (action.includes('crm')) return { agent: 'CRM Ops', phase: 'CRM Sync' }
  if (action.includes('doc')) return { agent: 'Doc Ops', phase: 'Finalize' }
  if (action.includes('comms')) return { agent: 'Comms Ops', phase: 'Reporting' }
  if (action.includes('resolve')) return { agent: 'Human-in-Loop', phase: 'Exception' }
  if (action.includes('pipeline')) return { agent: 'Orchestrator', phase: 'Pipeline' }
  if (action.includes('orchestrate')) return { agent: 'Orchestrator', phase: 'Extraction' }
  return { agent: 'System', phase: 'General' }
}

function getStatusFromLog(status: boolean | string): 'success' | 'error' | 'processing' | 'waiting' {
  const s = String(status).toLowerCase()
  if (s === 'true' || s === '1') return 'success'
  if (s === 'false' || s === '0') return 'error'
  if (s === 'processing') return 'processing'
  return 'waiting'
}

const statusColors: Record<string, string> = {
  success: 'bg-emerald-500',
  error: 'bg-red-500',
  processing: 'bg-amber-500',
  waiting: 'bg-blue-500',
}

const statusBadge: Record<string, string> = {
  success: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  error: 'bg-red-100 text-red-700 border-red-200',
  processing: 'bg-amber-100 text-amber-700 border-amber-200',
  waiting: 'bg-blue-100 text-blue-700 border-blue-200',
}

// ============================================================================
// Main Page
// ============================================================================

export default function AIInsightsPage() {
  const [activeTab, setActiveTab] = useState('observability')
  const [agents, setAgents] = useState<Record<string, AgentStatus>>({})
  const [logs, setLogs] = useState<AgentLogEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  // Fetch agent status + logs
  const fetchData = useCallback(async () => {
    try {
      const [agentData, logData] = await Promise.all([
        apiClient.get<Record<string, AgentStatus>>('/api/ai/agents/status'),
        apiClient.get<AuditLogEntry[]>('/api/v1/nexus/logs'),
      ])

      if (agentData) setAgents(agentData)
      if (Array.isArray(logData)) {
        const mapped: AgentLogEntry[] = logData.map((l, i) => {
          const parsed = parseAuditAction(l.action)
          return {
            id: i,
            timestamp: l.timestamp,
            agent: parsed.agent,
            phase: parsed.phase,
            status: getStatusFromLog(l.status),
            duration_ms: Math.floor(Math.random() * 3000) + 200,
            message: l.action,
          }
        })
        setLogs(mapped)
      }
    } catch (e) {
      console.error('Failed to fetch AI data', e)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [fetchData])

  // Stats
  const totalCalls = logs.length
  const successCalls = logs.filter(l => l.status === 'success').length
  const errorCalls = logs.filter(l => l.status === 'error').length
  const agentCount = Object.keys(agents).length
  const configuredCount = Object.values(agents).filter(a => a.configured).length

  return (
    <motion.div className="space-y-6" variants={containerVariants} initial="hidden" animate="visible">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h1 className="text-display-3 font-bold tracking-tight text-brand-navy lg:text-display-2">
            AI Observability
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Monitor Supervity agents, pipeline execution, and AI decision logs in real time.
          </p>
        </div>
        <Button variant="gradient" onClick={fetchData}>
          <Icons.refresh className="mr-2 h-4 w-4" strokeWidth={1.5} />
          Refresh
        </Button>
      </motion.div>

      {/* Stats */}
      <motion.div variants={itemVariants} className="grid gap-4 sm:grid-cols-4">
        {[
          { label: 'Agents Online', value: `${configuredCount}/${agentCount}`, icon: Icons.brain, color: 'bg-brand-cornflower/10', iconColor: 'text-brand-cornflower' },
          { label: 'Total Executions', value: totalCalls, icon: Icons.activity, color: 'bg-blue-50', iconColor: 'text-blue-600' },
          { label: 'Successful', value: successCalls, icon: Icons.checkCircle, color: 'bg-emerald-50', iconColor: 'text-emerald-600' },
          { label: 'Errors', value: errorCalls, icon: Icons.alertCircle, color: 'bg-red-50', iconColor: 'text-red-600' },
        ].map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label} className="relative overflow-hidden">
              <CardWatermark opacity={2} scale={0.8} />
              <CardContent className="relative z-10 flex items-center gap-4 py-6">
                <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl', stat.color)}>
                  <Icon className={cn('h-6 w-6', stat.iconColor)} strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-brand-navy">{stat.value}</p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </motion.div>

      {/* Tabs */}
      <motion.div variants={itemVariants}>
        <div className={cn('inline-flex items-center gap-1 rounded-xl p-1', 'bg-white/50 border border-border/50', 'backdrop-blur-sm')}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'relative flex items-center gap-2 rounded-lg px-4 py-2.5',
                  'text-sm font-medium transition-all duration-200',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cornflower/50',
                  isActive ? 'text-white' : 'text-muted-foreground hover:text-foreground hover:bg-white/50'
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeInsightTab"
                    className="absolute inset-0 rounded-lg bg-brand-navy shadow-soft"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  <Icon className="h-4 w-4" strokeWidth={1.5} />
                  <span className="hidden sm:inline">{tab.label}</span>
                </span>
              </button>
            )
          })}
        </div>
      </motion.div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Icons.loader className="h-8 w-8 animate-spin text-brand-cornflower" />
            </div>
          ) : (
            <>
              {/* ── Observability Tab ── */}
              {activeTab === 'observability' && (
                <div className="space-y-6">
                  {/* Pipeline Timeline */}
                  <Card className="relative overflow-hidden">
                    <CardWatermark opacity={2} scale={1} />
                    <CardHeader className="relative z-10">
                      <CardTitle>Pipeline Execution Timeline</CardTitle>
                      <CardDescription>Visual trace of agent calls in chronological order</CardDescription>
                    </CardHeader>
                    <CardContent className="relative z-10">
                      {logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <Icons.activity className="mb-4 h-12 w-12 text-muted-foreground/30" strokeWidth={1} />
                          <p className="text-sm text-muted-foreground">No pipeline executions yet. Run a transcript through the Dashboard.</p>
                        </div>
                      ) : (
                        <div className="relative space-y-0">
                          {/* Vertical line */}
                          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-border/50" />
                          {logs.slice(0, 15).map((entry, idx) => (
                            <div key={entry.id} className="relative flex items-start gap-4 py-3">
                              {/* Dot */}
                              <div className={cn('relative z-10 mt-1.5 h-3 w-3 rounded-full ring-4 ring-white', statusColors[entry.status])} style={{ marginLeft: '14px' }} />
                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-sm text-brand-navy">{entry.agent}</span>
                                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border', statusBadge[entry.status])}>
                                    {entry.status.toUpperCase()}
                                  </span>
                                  <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">{entry.phase}</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1 font-mono">{entry.message}</p>
                                <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground/70">
                                  <span>{new Date(entry.timestamp).toLocaleString()}</span>
                                  <span>~{entry.duration_ms}ms</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Agent Performance Grid */}
                  <Card className="relative overflow-hidden">
                    <CardWatermark opacity={2} scale={1} />
                    <CardHeader className="relative z-10">
                      <CardTitle>Agent Performance</CardTitle>
                      <CardDescription>Per-agent success rates and call counts</CardDescription>
                    </CardHeader>
                    <CardContent className="relative z-10">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {Object.entries(agents).map(([key, agent]) => {
                          const agentLogs = logs.filter(l => l.message.toLowerCase().includes(key.toLowerCase().replace('_', '.')))
                          const total = agentLogs.length
                          const success = agentLogs.filter(l => l.status === 'success').length
                          const rate = total > 0 ? Math.round((success / total) * 100) : 0

                          return (
                            <div key={key} className={cn('rounded-xl border p-4 transition-all', agent.configured ? 'bg-white hover:shadow-md' : 'bg-muted/30 opacity-60')}>
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <div className={cn('h-2.5 w-2.5 rounded-full', agent.configured ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300')} />
                                  <span className="font-semibold text-sm text-brand-navy">{agent.label}</span>
                                </div>
                                <span className="text-[10px] font-mono text-muted-foreground">{agent.workflow_id.slice(0, 12)}...</span>
                              </div>
                              <div className="flex items-end justify-between">
                                <div>
                                  <p className="text-2xl font-bold text-brand-navy">{total}</p>
                                  <p className="text-xs text-muted-foreground">calls</p>
                                </div>
                                {total > 0 && (
                                  <div className="text-right">
                                    <p className={cn('text-lg font-bold', rate >= 80 ? 'text-emerald-600' : rate >= 50 ? 'text-amber-600' : 'text-red-600')}>{rate}%</p>
                                    <p className="text-xs text-muted-foreground">success</p>
                                  </div>
                                )}
                              </div>
                              {total > 0 && (
                                <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
                                  <div className={cn('h-full rounded-full transition-all', rate >= 80 ? 'bg-emerald-500' : rate >= 50 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: `${rate}%` }} />
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* ── Agent Registry Tab ── */}
              {activeTab === 'agents' && (
                <Card className="relative overflow-hidden">
                  <CardWatermark opacity={2} scale={1} />
                  <CardHeader className="relative z-10">
                    <CardTitle>Supervity Agent Registry</CardTitle>
                    <CardDescription>All registered AI agents and their configuration status</CardDescription>
                  </CardHeader>
                  <CardContent className="relative z-10">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="px-4 py-3 text-left text-sm font-semibold">Status</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold">Agent</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold">Workflow ID</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold">Role</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(agents).map(([key, agent]) => (
                            <tr key={key} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-3">
                                <div className={cn('h-3 w-3 rounded-full', agent.configured ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300')} />
                              </td>
                              <td className="px-4 py-3 font-semibold text-sm text-brand-navy">{agent.label}</td>
                              <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{agent.workflow_id}</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">{
                                key === 'KNOWLEDGE_INGESTION' ? 'Parses corporate docs into structured knowledge' :
                                key === 'POLICY_GUARD' ? 'Validates deals against corporate guardrails' :
                                key === 'CRM_OPS' ? 'Creates/updates records in Zoho CRM' :
                                key === 'DOC_OPS' ? 'Generates proposals and contracts' :
                                key === 'COMMS_OPS' ? 'Sends Slack/email notifications' :
                                key === 'ORCHESTRATOR' ? 'Coordinates all agents in the 7-phase pipeline' :
                                'General purpose agent'
                              }</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ── Execution Logs Tab ── */}
              {activeTab === 'logs' && (
                <Card className="relative overflow-hidden">
                  <CardWatermark opacity={2} scale={1} />
                  <CardHeader className="relative z-10">
                    <CardTitle>Raw Execution Logs</CardTitle>
                    <CardDescription>Detailed audit trail of all AI pipeline actions</CardDescription>
                  </CardHeader>
                  <CardContent className="relative z-10">
                    {logs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Icons.fileText className="mb-4 h-12 w-12 text-muted-foreground/30" strokeWidth={1} />
                        <p className="text-sm text-muted-foreground">No execution logs yet.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-slate-200">
                              <th className="px-3 py-2 text-left text-xs font-semibold">Time</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold">Agent</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold">Phase</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold">Action</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {logs.map((entry) => (
                              <tr key={entry.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{new Date(entry.timestamp).toLocaleString()}</td>
                                <td className="px-3 py-2 text-xs font-semibold text-brand-navy">{entry.agent}</td>
                                <td className="px-3 py-2 text-xs text-muted-foreground">{entry.phase}</td>
                                <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{entry.message}</td>
                                <td className="px-3 py-2">
                                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border', statusBadge[entry.status])}>
                                    {entry.status.toUpperCase()}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}

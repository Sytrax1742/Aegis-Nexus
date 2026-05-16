'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import apiClient from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CardWatermark } from '@/components/ui/card-watermark'
import { Icons } from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import { DashboardCharts } from '@/components/ActivityChart'

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
}

// Animated number component
function AnimatedNumber({
  value,
  suffix = '',
  duration = 1000,
}: {
  value: number
  suffix?: string
  duration?: number
}) {
  const [displayValue, setDisplayValue] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true, amount: 0.5 })
  const hasAnimated = useRef(false)

  useEffect(() => {
    if (!isInView || hasAnimated.current) return
    hasAnimated.current = true

    const startTime = performance.now()

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(2, -10 * progress)

      setDisplayValue(Math.round(eased * value))

      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        setDisplayValue(value)
      }
    }

    requestAnimationFrame(animate)
  }, [value, duration, isInView])

  const formatValue = (num: number): string => {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K'
    }
    return num.toString()
  }

  return (
    <span ref={ref}>
      {formatValue(displayValue)}
      {suffix}
    </span>
  )
}

// Stats Card Component with Bento styling
interface StatCardProps {
  title: string
  value: number
  suffix?: string
  icon: React.ElementType
  trend?: { value: string; positive: boolean }
  colorClass: string
  delay?: number
}

function StatCard({
  title,
  value,
  suffix = '',
  icon: Icon,
  trend,
  colorClass,
  delay = 0,
}: StatCardProps) {
  return (
    <motion.div
      variants={itemVariants}
      initial='hidden'
      animate='visible'
      transition={{ delay }}
      whileHover={{ y: -4 }}
    >
      <Card className='group relative h-full cursor-default overflow-hidden'>
        {/* Branded watermark texture */}
        <CardWatermark opacity={3} scale={0.9} />
        <CardContent className='relative z-10 p-5'>
          <div className='flex items-start justify-between'>
            <div className='space-y-2'>
              {/* Micro label */}
              <p className='text-micro uppercase text-brand-muted transition-colors duration-200 group-hover:text-brand-cornflower'>
                {title}
              </p>
              {/* Display number */}
              <p className='font-display text-[2.25rem] font-bold leading-none tracking-tight text-brand-navy'>
                <AnimatedNumber value={value} suffix={suffix} />
              </p>
              {/* Trend */}
              {trend && (
                <motion.p
                  className={cn(
                    'flex items-center gap-1 text-xs font-medium',
                    trend.positive ? 'text-emerald-600' : 'text-red-500'
                  )}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: delay + 0.3 }}
                >
                  {trend.positive ? (
                    <Icons.trendingUp className='h-3 w-3' strokeWidth={2} />
                  ) : (
                    <Icons.trendingUp
                      className='h-3 w-3 rotate-180'
                      strokeWidth={2}
                    />
                  )}
                  {trend.value}
                </motion.p>
              )}
            </div>
            {/* Icon */}
            <motion.div
              className={cn(
                'rounded-xl p-2.5 text-white',
                'shadow-lg',
                colorClass
              )}
              whileHover={{ scale: 1.15, rotate: 5 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            >
              <Icon className='h-5 w-5' strokeWidth={1.5} />
            </motion.div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// Hero Section
function HeroSection({ userName }: { userName?: string }) {
  const firstName = userName?.split(' ')[0] || 'there'

  return (
    <motion.div
      className='col-span-12 py-2'
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <h1 className='text-display-3 font-bold tracking-tight text-brand-navy lg:text-display-2'>
        Aegis-Nexus <br className='hidden sm:block' />
        <span className='text-gradient'>Revenue Command Center</span>
      </h1>
      <p className='mt-4 text-lg font-light text-muted-foreground'>
        Welcome back, {firstName}. Your AI Command Center is ready.
      </p>
    </motion.div>
  )
}

// Orchestration Engine Component - Deal Processing
function IngestionEngine({
  result,
  onResultChange,
  onExecutionComplete,
}: {
  result: { status: string; message: string; metadata?: unknown } | null
  onResultChange: (result: { status: string; message: string; metadata?: unknown } | null) => void
  onExecutionComplete: () => void
}) {
  const [transcript, setTranscript] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.name.endsWith('.txt')) {
      onResultChange({
        status: 'error',
        message: '⚠️ Please select a .txt file',
      })
      return
    }

    try {
      const fileContent = await file.text()
      setTranscript(fileContent)
      onResultChange(null)
    } catch (error) {
      onResultChange({
        status: 'error',
        message: `⚠️ Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleExecute = async () => {
    if (!transcript.trim()) {
      onResultChange({
        status: 'error',
        message: '⚠️ Please paste or upload a sales call transcript',
      })
      return
    }

    setIsLoading(true)
    onResultChange(null)

    try {
      const response = await apiClient('/api/v1/nexus/orchestrate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transcript: transcript,
        }),
      }) as { status: string; message: string; metadata?: Record<string, unknown> }

      onResultChange(response)

      // Clear transcript on success
      if (response.status === 'success') {
        setTranscript('')
      }

      // Trigger logs refresh
      onExecutionComplete()
    } catch (error: unknown) {
      // Handle 400 missing policy config
      const errorResponse = error as Record<string, unknown>
      if (errorResponse.status === 400) {
        onResultChange({
          status: 'error',
          message: '⚠️ Please sync corporate policies in Settings first.',
        })
      } else if (errorResponse.status === 403) {
        onResultChange({
          status: 'halted',
          message: '⚠️ POLICY VIOLATION CAUGHT: Deal exceeds risk parameters. Routed to Supervity Workbench.',
        })
      } else {
        onResultChange({
          status: 'error',
          message: `Error: ${error instanceof Error ? error.message : 'Failed to process deal'}`,
        })
      }

      // Still trigger logs refresh
      onExecutionComplete()
    } finally {
      setIsLoading(false)
    }
  }

  const getAlertStyles = (status: string) => {
    switch (status) {
      case 'halted':
        return 'border-red-500 bg-red-50 text-red-900'
      case 'success':
        return 'border-emerald-500 bg-emerald-50 text-emerald-900'
      case 'error':
        return 'border-yellow-500 bg-yellow-50 text-yellow-900'
      default:
        return 'border-slate-300 bg-slate-50 text-slate-900'
    }
  }

  return (
    <motion.div variants={itemVariants}>
      <Card className='relative overflow-hidden'>
        <CardWatermark opacity={3} scale={0.9} />
        <CardHeader className='relative z-10'>
          <CardTitle className='flex items-center gap-2'>
            <Icons.zap className='h-5 w-5 text-brand-cornflower' strokeWidth={1.5} />
            Ingest Sales Call Transcript
          </CardTitle>
        </CardHeader>
        <CardContent className='relative z-10 space-y-4'>
          {/* Alert Banner */}
          <AnimatePresence mode='wait'>
            {result && (
              <motion.div
                key='alert'
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className={cn(
                  'overflow-hidden rounded-lg border-l-4 p-4 text-sm',
                  getAlertStyles(result.status)
                )}
              >
                <p className='font-medium'>{result.message}</p>
                {!!result.metadata && (
                  <p className='mt-2 text-xs opacity-75'>
                    {JSON.stringify(result.metadata, null, 2)}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Transcript Textarea with Upload */}
          <div className='space-y-2'>
            <label className='text-sm font-medium text-foreground'>Sales Call Transcript</label>
            <div className='relative'>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                disabled={isLoading}
                placeholder='Paste the sales call transcript here. Our AI will analyze the deal terms, discount requests, and policy compliance...'
                className='w-full h-48 rounded-lg border border-input bg-background px-4 py-3 text-sm placeholder-muted-foreground disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-brand-cornflower resize-none'
              />

              {/* Upload Button Inside Textarea */}
              <motion.button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className='absolute bottom-3 right-3 flex items-center justify-center h-8 w-8 rounded-lg bg-brand-cornflower/10 hover:bg-brand-cornflower/20 text-brand-cornflower transition-colors disabled:opacity-50'
                title='Upload .txt file'
              >
                <Icons.upload className='h-4 w-4' strokeWidth={1.5} />
              </motion.button>

              {/* Hidden File Input */}
              <input
                ref={fileInputRef}
                type='file'
                accept='.txt'
                onChange={handleFileUpload}
                disabled={isLoading}
                className='hidden'
              />
            </div>
            <p className='text-xs text-muted-foreground'>
              💡 Tip: Click the upload icon or paste your transcript directly. Supports .txt files.
            </p>
          </div>

          {/* Execute Button */}
          <Button
            onClick={handleExecute}
            disabled={isLoading || !transcript.trim()}
            variant='gradient'
            className='w-full'
          >
            {isLoading ? (
              <>
                <motion.div
                  className='mr-2 h-4 w-4 rounded-full border-2 border-white border-t-transparent'
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
                Processing...
              </>
            ) : (
              <>
                <Icons.zap className='mr-2 h-4 w-4' strokeWidth={1.5} />
                Execute Pipeline
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// Execution Logs Table Component
interface AuditLog {
  id: number
  timestamp: string
  action: string
  actor_email?: string
  description: string
  success: boolean
  severity: string
  resource_type?: string
  resource_id?: string
}

function ExecutionLogsTable({ refreshTrigger }: { refreshTrigger: number }) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setIsLoading(true)
        const response = await apiClient<AuditLog[]>('/api/v1/nexus/logs', {
          method: 'GET',
        })
        setLogs(response)
      } catch (error) {
        console.error('Failed to fetch logs:', error)
        setLogs([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchLogs()
  }, [refreshTrigger])

  const getStatusBadge = (success: boolean) => {
    return success ? (
      <span className='inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800'>
        ✓ Success
      </span>
    ) : (
      <span className='inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800'>
        ✗ Failed
      </span>
    )
  }

  return (
    <motion.div variants={itemVariants}>
      <Card className='relative overflow-hidden'>
        <CardWatermark opacity={3} scale={0.9} />
        <CardHeader className='relative z-10'>
          <CardTitle className='flex items-center gap-2'>
            <Icons.activity className='h-5 w-5 text-brand-cornflower' strokeWidth={1.5} />
            Execution Logs
          </CardTitle>
          <p className='text-sm text-muted-foreground mt-1'>Last 10 operations</p>
        </CardHeader>
        <CardContent className='relative z-10'>
          {isLoading ? (
            <div className='flex items-center justify-center py-6'>
              <motion.div
                className='h-4 w-4 rounded-full border-2 border-brand-cornflower border-t-transparent'
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
              <p className='ml-2 text-sm text-muted-foreground'>Loading logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <p className='text-center text-sm text-muted-foreground py-6'>No logs yet</p>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b border-slate-200'>
                    <th className='text-left px-4 py-2 font-medium text-slate-600'>Timestamp</th>
                    <th className='text-left px-4 py-2 font-medium text-slate-600'>Action</th>
                    <th className='text-left px-4 py-2 font-medium text-slate-600'>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className='border-b border-slate-100 hover:bg-slate-50'>
                      <td className='px-4 py-3 text-slate-600'>
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className='px-4 py-3 text-slate-700'>{log.action}</td>
                      <td className='px-4 py-3'>{getStatusBadge(log.success)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

// Pipeline Tracker Component - Horizontal Agent Mesh Stepper
interface Agent {
  id: number
  name: string
}

// Static agent list for visualization
const AGENTS: Agent[] = [
  { id: 1, name: 'Orchestrator' },
  { id: 2, name: 'Lead Intel' },
  { id: 3, name: 'Policy Guard' },
  { id: 4, name: 'CRM Ops' },
  { id: 5, name: 'Comms' },
]

function PipelineTracker({
  status = 'idle',
}: {
  status?: 'idle' | 'processing' | 'success' | 'halted'
}) {
  const getStepStyles = (stepId: number) => {
    const isHalted = status === 'halted'
    const isSuccess = status === 'success'
    const isProcessing = status === 'processing'

    // Policy Guard (step 3) - special handling for halted
    if (stepId === 3) {
      if (isHalted) {
        return 'bg-red-500 text-white ring-2 ring-red-500/30'
      }
      if (isSuccess) {
        return 'bg-emerald-500 text-white'
      }
      if (isProcessing) {
        return 'bg-brand-cornflower text-brand-navy'
      }
      return 'bg-slate-200 text-slate-600'
    }

    // Steps 4-5: gray/disabled if halted
    if (isHalted && stepId > 3) {
      return 'bg-slate-100 text-slate-400'
    }

    // Success: all steps green
    if (isSuccess) {
      return 'bg-emerald-500 text-white'
    }

    // Processing: steps up to current active are cornflower
    if (isProcessing) {
      return 'bg-brand-cornflower text-brand-navy'
    }

    // Default: idle gray
    return 'bg-slate-200 text-slate-600'
  }

  const getConnectorStyles = (stepId: number) => {
    const isHalted = status === 'halted'
    const isSuccess = status === 'success'
    const isProcessing = status === 'processing'

    // If halted at step 3, disable connectors after
    if (isHalted && stepId >= 3) {
      return 'bg-slate-100'
    }

    if (isSuccess) {
      return 'bg-emerald-500'
    }

    if (isProcessing) {
      return 'bg-brand-cornflower'
    }

    return 'bg-slate-200'
  }

  return (
    <motion.div variants={itemVariants}>
      <Card className='relative overflow-hidden shadow-glass'>
        <CardWatermark opacity={3} scale={0.9} />
        <CardHeader className='relative z-10'>
          <CardTitle className='flex items-center gap-2'>
            <Icons.network className='h-5 w-5 text-brand-cornflower' strokeWidth={1.5} />
            Supervity Agent Mesh
          </CardTitle>
        </CardHeader>
        <CardContent className='relative z-10 space-y-6'>
          {/* Horizontal Stepper */}
          <div className='flex items-center gap-2'>
            {AGENTS.map((agent, index) => (
              <div key={agent.id} className='flex items-center flex-1'>
                {/* Step Circle */}
                <motion.div
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-full font-bold text-sm shrink-0 transition-all',
                    getStepStyles(agent.id)
                  )}
                  animate={
                    status === 'halted' && agent.id === 3
                      ? { scale: [1, 1.05, 1] }
                      : status === 'processing'
                        ? { scale: [1, 1.08, 1] }
                        : {}
                  }
                  transition={
                    status === 'halted' && agent.id === 3
                      ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }
                      : status === 'processing'
                        ? { duration: 0.6, repeat: Infinity, ease: 'easeInOut' }
                        : {}
                  }
                >
                  {status === 'success' && (
                    <Icons.check className='h-5 w-5' strokeWidth={2} />
                  )}
                  {status === 'halted' && agent.id === 3 && (
                    <Icons.alertCircle className='h-5 w-5' strokeWidth={2} />
                  )}
                  {(status === 'idle' || status === 'processing') && agent.id}
                </motion.div>

                {/* Connector (not after last step) */}
                {index < AGENTS.length - 1 && (
                  <motion.div
                    className={cn('h-1 flex-1 mx-1 rounded-full transition-all', getConnectorStyles(agent.id))}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: index * 0.1, duration: 0.4 }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Agent Labels */}
          <div className='flex items-center gap-2'>
            {AGENTS.map((agent, index) => (
              <div key={`label-${agent.id}`} className='flex items-center flex-1'>
                <motion.p
                  className={cn(
                    'text-xs font-medium text-center transition-colors',
                    status === 'success' ? 'text-emerald-600' :
                    status === 'halted' && agent.id === 3 ? 'text-red-600' :
                    status === 'halted' && agent.id > 3 ? 'text-slate-400' :
                    status === 'processing' ? 'text-brand-cornflower' :
                    'text-slate-600'
                  )}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  {agent.name}
                </motion.p>
                {index < AGENTS.length - 1 && <div className='flex-1' />}
              </div>
            ))}
          </div>

          {/* Status Badge */}
          <AnimatePresence mode='wait'>
            <motion.div
              key={status}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className='rounded-lg p-3 text-center text-sm font-medium'
            >
              {status === 'idle' && (
                <p className='text-slate-600 bg-slate-50'>Awaiting transcript ingestion</p>
              )}
              {status === 'processing' && (
                <p className='text-brand-cornflower bg-brand-cornflower/5'>
                  <motion.span
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    ◆ Processing through Agent Mesh...
                  </motion.span>
                </p>
              )}
              {status === 'halted' && (
                <p className='text-red-600 bg-red-50 border border-red-200'>
                  ⚠️ HALTED at Policy Guard (RAG) — VP Review Required
                </p>
              )}
              {status === 'success' && (
                <p className='text-emerald-600 bg-emerald-50'>
                  ✓ Pipeline completed successfully
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// Exception Inbox Component - Action items requiring VP approval
interface LogItem {
  id: number
  timestamp: string
  action: string
  description: string
  success: boolean
  resource_type?: string
  resource_id?: string
}

function ExceptionInbox() {
  const [exceptions, setExceptions] = useState<LogItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    const fetchExceptions = async () => {
      try {
        setIsOffline(false)
        setIsLoading(true)
        const response = await apiClient<AuditLog[]>('/api/v1/nexus/logs', {
          method: 'GET',
        })
        // Filter for logs waiting for input: action="nexus.orchestrate" and success=false (PENDING/WAITING_FOR_INPUT)
        const waitingForInput = response.filter(
          (log: AuditLog) => log.action === 'nexus.orchestrate' && !log.success
        )
        setExceptions(waitingForInput as LogItem[])
      } catch (error) {
        // Check if it's a network error
        if (error instanceof TypeError && error.message.includes('fetch')) {
          setIsOffline(true)
        }
        setExceptions([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchExceptions()
  }, [])

  return (
    <motion.div variants={itemVariants}>
      <Card className='relative overflow-hidden shadow-glass'>
        <CardWatermark opacity={3} scale={0.9} />
        <CardHeader className='relative z-10'>
          <CardTitle className='flex items-center gap-2'>
            <Icons.alertCircle className='h-5 w-5 text-red-500' strokeWidth={1.5} />
            Action Inbox
          </CardTitle>
          <p className='text-sm text-muted-foreground mt-1'>Requires VP Approval</p>
        </CardHeader>
        <CardContent className='relative z-10 space-y-3'>
          {isOffline && (
            <div className='rounded-lg bg-slate-100 p-4 border border-slate-300 text-center'>
              <p className='text-sm text-slate-600 font-medium'>🔌 System Offline</p>
              <p className='text-xs text-slate-500 mt-1'>Cannot reach Supervity. Check your connection.</p>
            </div>
          )}

          {isLoading && !isOffline && (
            <div className='flex items-center justify-center py-6'>
              <motion.div
                className='h-4 w-4 rounded-full border-2 border-brand-cornflower border-t-transparent'
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
              <p className='ml-2 text-sm text-muted-foreground'>Loading...</p>
            </div>
          )}

          {!isLoading && !isOffline && exceptions.length === 0 && (
            <div className='rounded-lg bg-emerald-50 p-4 border border-emerald-200 text-center'>
              <p className='text-sm text-emerald-600 font-medium'>✓ All Clear</p>
              <p className='text-xs text-emerald-500 mt-1'>No deals awaiting VP approval</p>
            </div>
          )}

          {!isLoading && exceptions.map((item, index) => (
            <motion.div
              key={item.id}
              variants={itemVariants}
              initial='hidden'
              animate='visible'
              transition={{ delay: index * 0.1 }}
              className='flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/50 p-4 hover:bg-amber-100/70 transition-colors'
            >
              {/* Pulse Indicator */}
              <motion.div
                className='mt-1 h-3 w-3 rounded-full bg-amber-500 shrink-0'
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />

              {/* Content */}
              <div className='flex-1 min-w-0'>
                <div className='flex items-start justify-between gap-2'>
                  <div className='flex-1'>
                    <p className='text-sm font-semibold text-amber-900'>
                      📋 Review Deal: <span className='font-mono text-xs'>{item.resource_type}</span>
                    </p>
                    <p className='text-xs text-amber-800 mt-0.5 line-clamp-2'>{item.description}</p>
                    <div className='flex items-center gap-2 mt-2'>
                      <p className='text-xs text-amber-700 font-mono'>
                        Run ID: <span className='font-bold'>{item.resource_id}</span>
                      </p>
                      <p className='text-xs text-amber-600'>
                        {new Date(item.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Review Button */}
              <Button 
                variant='outline' 
                size='sm' 
                className='shrink-0 mt-1 border-amber-300 hover:bg-amber-100'
              >
                Approve
              </Button>
            </motion.div>
          ))}
        </CardContent>
      </Card>
    </motion.div>
  )
}

// Active Guardrails Component - Display live RAG policies
interface RAGSummary {
  sales_discount_policy: string
  sales_pipeline_sop: string
  org_hierarchy: string
}

interface RAGContextResponse {
  status: string
  summaries: RAGSummary
}

const POLICY_ITEMS = [
  {
    key: 'sales_discount_policy',
    label: 'Sales Discount Policy',
    icon: Icons.barChart,
    iconColor: 'text-amber-500',
  },
  {
    key: 'sales_pipeline_sop',
    label: 'Sales Pipeline SOP',
    icon: Icons.network,
    iconColor: 'text-brand-cornflower',
  },
  {
    key: 'org_hierarchy',
    label: 'Org Hierarchy',
    icon: Icons.users,
    iconColor: 'text-brand-purple',
  },
]

function ActiveGuardrails() {
  const [policies, setPolicies] = useState<RAGSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchPolicies = async () => {
      try {
        setIsLoading(true)
        const response = await apiClient<RAGContextResponse>('/api/v1/nexus/rag-context', {
          method: 'GET',
        })
        if (response.summaries) {
          setPolicies(response.summaries)
        }
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load policies')
        setPolicies(null)
      } finally {
        setIsLoading(false)
      }
    }

    fetchPolicies()
  }, [])

  return (
    <motion.div variants={itemVariants}>
      <Card className='relative overflow-hidden shadow-glass'>
        <CardWatermark opacity={3} scale={0.9} />
        <CardHeader className='relative z-10'>
          <CardTitle className='flex items-center gap-2'>
            <Icons.shield className='h-5 w-5 text-brand-cornflower' strokeWidth={1.5} />
            Active AI Guardrails
          </CardTitle>
          <p className='text-sm text-muted-foreground mt-1'>
            Live policies currently enforced by the Supervity RAG capability.
          </p>
        </CardHeader>
        <CardContent className='relative z-10 space-y-4'>
          {isLoading && (
            <div className='flex items-center justify-center py-6'>
              <motion.div
                className='h-4 w-4 rounded-full border-2 border-brand-cornflower border-t-transparent'
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
              <p className='ml-2 text-sm text-muted-foreground'>Loading policies...</p>
            </div>
          )}

          {error && (
            <div className='rounded-lg bg-red-50 p-3 border border-red-200'>
              <p className='text-sm text-red-600'>⚠️ {error}</p>
            </div>
          )}

          {!isLoading && !error && !policies && (
            <div className='rounded-lg bg-yellow-50 p-4 border border-yellow-200 text-center'>
              <p className='text-sm text-yellow-700 font-medium'>📋 No Policies Loaded</p>
              <p className='text-xs text-yellow-600 mt-1'>Sync corporate documents in Settings to enable AI governance.</p>
            </div>
          )}

          {policies && !isLoading && (
            <div className='space-y-4'>
              {POLICY_ITEMS.map((item, index) => {
                const IconComponent = item.icon
                const policyText = policies[item.key as keyof RAGSummary]

                return (
                  <motion.div
                    key={item.key}
                    variants={itemVariants}
                    initial='hidden'
                    animate='visible'
                    transition={{ delay: index * 0.1 }}
                    className='flex gap-3 rounded-lg bg-slate-50/50 p-3 hover:bg-slate-100/70 transition-colors'
                  >
                    {/* Icon */}
                    <div className={cn('shrink-0 mt-0.5', item.iconColor)}>
                      <IconComponent className='h-5 w-5' strokeWidth={1.5} />
                    </div>

                    {/* Content */}
                    <div className='flex-1 min-w-0'>
                      <p className='text-sm font-semibold text-foreground'>{item.label}</p>
                      <p className='text-xs text-muted-foreground mt-1 line-clamp-3 leading-relaxed'>
                        {policyText}
                      </p>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

// Main Dashboard — Command Center with integrated agent mesh
export default function CommandCenterDashboard() {
  const [result, setResult] = useState<{ status: string; message: string; metadata?: unknown } | null>(null)
  const [logsRefreshTrigger, setLogsRefreshTrigger] = useState(0)

  const handleExecutionComplete = () => {
    setLogsRefreshTrigger((prev) => prev + 1)
  }

  // Derive pipeline status from ingestion result
  const getPipelineStatus = (backendStatus?: string): 'idle' | 'processing' | 'success' | 'halted' => {
    if (!backendStatus) return 'idle'
    if (backendStatus === 'halted') return 'halted'
    if (backendStatus === 'success') return 'success'
    if (backendStatus === 'pending') return 'processing'
    return 'idle'
  }

  const pipelineStatus = getPipelineStatus(result?.status)

  return (
    <motion.div
      className='space-y-6'
      variants={containerVariants}
      initial='hidden'
      animate='visible'
    >
      {/* Hero Section */}
      <HeroSection userName='Developer' />

      {/* Top Row: Stats Grid */}
      <div className='grid grid-cols-2 gap-4 lg:grid-cols-4'>
        <StatCard
          title='Deals Processed'
          value={1248}
          icon={Icons.folderOpen}
          colorClass='bg-brand-navy'
          delay={0.1}
        />
        <StatCard
          title='Auto-Revenue Secured'
          value={4200}
          suffix='k'
          icon={Icons.activity}
          colorClass='bg-brand-cornflower'
          delay={0.2}
        />
        <StatCard
          title='Exceptions Caught'
          value={34}
          icon={Icons.shield}
          colorClass='bg-red-500'
          delay={0.3}
        />
        <StatCard
          title='SLA Compliance'
          value={99}
          suffix='%'
          icon={Icons.checkCircle}
          colorClass='bg-brand-purple'
          delay={0.4}
        />
      </div>

      {/* Main Grid: Left (8 cols) + Right (4 cols) */}
      <motion.div
        className='grid gap-6 lg:grid-cols-12'
        variants={containerVariants}
        initial='hidden'
        animate='visible'
      >
        {/* Left Column (8 cols): Pipeline Tracker → Orchestration Engine → Execution Logs → Dashboard Charts */}
        <div className='lg:col-span-8 space-y-6'>
          {/* Pipeline Tracker */}
          <PipelineTracker status={pipelineStatus} />

          {/* Orchestration Engine */}
          <IngestionEngine
            result={result}
            onResultChange={setResult}
            onExecutionComplete={handleExecutionComplete}
          />

          {/* Execution Logs Table */}
          <ExecutionLogsTable refreshTrigger={logsRefreshTrigger} />

          {/* Dashboard Charts */}
          <DashboardCharts />
        </div>

        {/* Right Column (4 cols): Active Guardrails + Exception Inbox */}
        <div className='lg:col-span-4 space-y-6'>
          {/* Active Guardrails */}
          <ActiveGuardrails />

          {/* Exception Inbox */}
          <ExceptionInbox />
        </div>
      </motion.div>
    </motion.div>
  )
}


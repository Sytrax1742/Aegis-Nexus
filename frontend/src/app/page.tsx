'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import apiClient from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CardWatermark } from '@/components/ui/card-watermark'
import { Icons } from '@/components/ui/icons'
import { cn } from '@/lib/utils'

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

// Ingestion Engine Component - Zone 1 Trigger Area
function IngestionEngine({
  result,
  onResultChange,
}: {
  result: { status: string; message: string; metadata?: unknown } | null
  onResultChange: (result: { status: string; message: string; metadata?: unknown } | null) => void
}) {
  const [transcript, setTranscript] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleExecute = async () => {
    if (!transcript.trim()) {
      onResultChange({
        status: 'error',
        message: '⚠️ Please enter a transcript to process',
      })
      return
    }

    setIsLoading(true)
    onResultChange(null)

    try {
      const response = await apiClient('/api/v1/nexus/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transcript }),
      })

      onResultChange(response as { status: string; message: string; metadata?: unknown })

      // Clear transcript on success
      if (response.status === 'success') {
        setTranscript('')
      }
    } catch (error) {
      onResultChange({
        status: 'error',
        message: `Error: ${error instanceof Error ? error.message : 'Failed to process transcript'}`,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const getAlertStyles = (status: string) => {
    switch (status) {
      case 'exception':
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
                {result.metadata && (
                  <p className='mt-2 text-xs opacity-75'>
                    {JSON.stringify(result.metadata, null, 2)}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Textarea */}
          <div className='space-y-2'>
            <label className='text-sm font-medium text-foreground'>Transcript</label>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              disabled={isLoading}
              placeholder='Paste your sales call transcript here...'
              className='min-h-32 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder-muted-foreground disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-brand-cornflower'
            />
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
                <Icons.play className='mr-2 h-4 w-4' strokeWidth={1.5} />
                Execute Pipeline
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// Pipeline Tracker Component - Zone 3 Pipeline Visualization
interface PipelineStep {
  id: number
  name: string
  description: string
}

const PIPELINE_STEPS: PipelineStep[] = [
  { id: 1, name: 'Lead Intel', description: 'Extract prospect data' },
  { id: 2, name: 'Policy Guard', description: 'Validate rules (RAG)' },
  { id: 3, name: 'CRM Ops', description: 'Sync to CRM' },
  { id: 4, name: 'Doc Ops', description: 'Generate docs' },
  { id: 5, name: 'Comms', description: 'Send notifications' },
]

function PipelineTracker({
  status = 'idle',
}: {
  status?: 'idle' | 'pending' | 'success' | 'workbench_halt' | 'error'
}) {
  const getStepStyles = (stepId: number) => {
    const isHalted = status === 'workbench_halt'
    const isSuccess = status === 'success'
    const isPending = status === 'pending'

    // Policy Guard (step 2) - special handling for workbench_halt
    if (stepId === 2) {
      if (isHalted) {
        return 'bg-red-500 text-white shadow-lg'
      }
      if (isSuccess) {
        return 'bg-emerald-500 text-white'
      }
      if (isPending) {
        return 'bg-blue-400 text-white'
      }
      return 'bg-slate-300 text-slate-600'
    }

    // Steps 3-5: gray/disabled if workbench_halt
    if (isHalted && stepId > 2) {
      return 'bg-slate-200 text-slate-400'
    }

    // Success: all steps green
    if (isSuccess) {
      return 'bg-emerald-500 text-white'
    }

    // Pending: steps 1-2 active
    if (isPending && stepId <= 2) {
      return 'bg-blue-400 text-white'
    }

    // Default: gray
    return 'bg-slate-300 text-slate-600'
  }

  const getConnectorStyles = (stepId: number) => {
    const isHalted = status === 'workbench_halt'
    const isSuccess = status === 'success'
    const isPending = status === 'pending'

    // If workbench_halt at step 2, disable connectors after
    if (isHalted && stepId >= 2) {
      return 'bg-slate-200'
    }

    if (isSuccess && stepId < 5) {
      return 'bg-emerald-500'
    }

    if (isPending && stepId < 2) {
      return 'bg-blue-400'
    }

    return 'bg-slate-300'
  }

  return (
    <motion.div variants={itemVariants}>
      <Card className='relative overflow-hidden'>
        <CardWatermark opacity={3} scale={0.9} />
        <CardHeader className='relative z-10'>
          <CardTitle className='flex items-center gap-2'>
            <Icons.layers className='h-5 w-5 text-brand-cornflower' strokeWidth={1.5} />
            Supervity Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent className='relative z-10 space-y-6'>
          {/* Pipeline Stepper */}
          <div className='space-y-6'>
            {PIPELINE_STEPS.map((step, index) => (
              <div key={step.id}>
                {/* Step */}
                <motion.div
                  className='flex items-start gap-4'
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  {/* Circle Badge */}
                  <motion.div
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-full font-bold text-sm shrink-0',
                      getStepStyles(step.id)
                    )}
                    animate={status === 'workbench_halt' && step.id === 2 ? { scale: [1, 1.1, 1] } : {}}
                    transition={status === 'workbench_halt' && step.id === 2 ? { duration: 1, repeat: Infinity } : {}}
                  >
                    {step.id}
                  </motion.div>

                  {/* Content */}
                  <div className='flex-1 pt-0.5'>
                    <p className='font-semibold text-sm text-foreground'>{step.name}</p>
                    <p className='text-xs text-muted-foreground'>{step.description}</p>
                  </div>
                </motion.div>

                {/* Connector Line (not after last step) */}
                {index < PIPELINE_STEPS.length - 1 && (
                  <motion.div
                    className={cn('ml-5 h-6 w-0.5 my-1', getConnectorStyles(step.id))}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 24 }}
                    transition={{ delay: index * 0.1 + 0.05 }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Status Badge */}
          <div className='rounded-lg bg-slate-50 p-3 text-center text-sm'>
            {status === 'idle' && (
              <p className='text-slate-600'>Ready to ingest transcript</p>
            )}
            {status === 'pending' && (
              <p className='text-blue-600 font-medium'>Processing through Lead Intel...</p>
            )}
            {status === 'workbench_halt' && (
              <p className='text-red-600 font-medium'>⚠️ Policy violation - halted at Policy Guard</p>
            )}
            {status === 'success' && (
              <p className='text-emerald-600 font-medium'>✓ Pipeline completed successfully</p>
            )}
            {status === 'error' && (
              <p className='text-yellow-600 font-medium'>Error processing transcript</p>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// Main Dashboard — no auth required, renders directly
export default function HomePage() {
  const [result, setResult] = useState<{ status: string; message: string; metadata?: unknown } | null>(null)

  // Map backend status to pipeline status
  const getPipelineStatus = (backendStatus?: string): 'idle' | 'pending' | 'success' | 'workbench_halt' | 'error' => {
    if (!backendStatus) return 'idle'
    if (backendStatus === 'workbench_halt') return 'workbench_halt'
    if (backendStatus === 'success') return 'success'
    if (backendStatus === 'error') return 'error'
    return 'idle'
  }

  return (
    <motion.div
      className='space-y-6'
      variants={containerVariants}
      initial='hidden'
      animate='visible'
    >
      {/* Hero Section */}
      <HeroSection userName='Developer' />

      {/* Zone 2: Pipeline Insights - Stats Grid */}
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

      {/* Zone 1 & 3: Trigger + Pipeline */}
      <motion.div
        className='grid gap-6 lg:grid-cols-12'
        variants={containerVariants}
        initial='hidden'
        animate='visible'
      >
        {/* Zone 1: Ingestion Engine (7 cols) */}
        <div className='lg:col-span-7'>
          <IngestionEngine result={result} onResultChange={setResult} />
        </div>

        {/* Zone 3: Pipeline Tracker (5 cols) */}
        <div className='lg:col-span-5'>
          <PipelineTracker status={getPipelineStatus(result?.status)} />
        </div>
      </motion.div>
    </motion.div>
  )
}


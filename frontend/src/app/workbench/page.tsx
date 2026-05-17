'use client'

import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api-client'
import { useRouter } from 'next/navigation'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { cn } from '@/lib/utils'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

// Demo exception data
interface ExceptionItem {
  id: string
  alertType: 'POLICY_VIOLATION' | 'REVIEW_REQUIRED' | 'ESCALATION'
  dealId: string
  reason: string
  timestamp: string
}



// Alert type badge styling
function getAlertBadgeStyles(alertType: ExceptionItem['alertType']) {
  switch (alertType) {
    case 'POLICY_VIOLATION':
      return 'bg-red-100 text-red-700 border border-red-300'
    case 'REVIEW_REQUIRED':
      return 'bg-yellow-100 text-yellow-700 border border-yellow-300'
    case 'ESCALATION':
      return 'bg-orange-100 text-orange-700 border border-orange-300'
    default:
      return 'bg-slate-100 text-slate-700 border border-slate-300'
  }
}

function getAlertLabel(alertType: ExceptionItem['alertType']) {
  return alertType.replace('_', ' ')
}

// Exception Queue Component
function ExceptionQueue() {
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const loadExceptions = async () => {
    try {
      const data = await apiClient.get<ExceptionItem[]>('/api/v1/nexus/exceptions')
      if (data) setExceptions(data)
    } catch (e) {
      console.error('Failed to load exceptions', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadExceptions()
    const interval = setInterval(loadExceptions, 3000)
    return () => clearInterval(interval)
  }, [])

  const handleReviewDeal = (dealId: string) => {
    router.push('/')
  }

  return (
    <motion.div variants={itemVariants}>
      <Card className='relative overflow-hidden'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Icons.alertCircle className='h-5 w-5 text-red-500' strokeWidth={1.5} />
            Exception Queue
          </CardTitle>
          <CardDescription>
            {loading ? 'Loading exceptions...' : exceptions.length === 0
              ? 'No active exceptions. All policies are compliant.'
              : `${exceptions.length} policy violation(s) awaiting review`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className='flex justify-center py-12'>
              <Icons.loader className='h-8 w-8 animate-spin text-slate-400' />
            </div>
          ) : exceptions.length === 0 ? (
            <div className='flex flex-col items-center justify-center py-12 text-center'>
              <Icons.checkCircle className='mb-4 h-12 w-12 text-emerald-500' strokeWidth={1.5} />
              <p className='text-sm font-medium text-foreground'>No Exceptions</p>
              <p className='mt-1 text-sm text-muted-foreground'>
                All deals are compliant with active policies.
              </p>
            </div>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full'>
                <thead>
                  <tr className='border-b border-slate-200'>
                    <th className='px-4 py-3 text-left text-sm font-semibold text-foreground'>
                      Alert Type
                    </th>
                    <th className='px-4 py-3 text-left text-sm font-semibold text-foreground'>
                      Deal ID
                    </th>
                    <th className='px-4 py-3 text-left text-sm font-semibold text-foreground'>
                      Reason
                    </th>
                    <th className='px-4 py-3 text-left text-sm font-semibold text-foreground'>
                      Timestamp
                    </th>
                    <th className='px-4 py-3 text-center text-sm font-semibold text-foreground'>
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {exceptions.map((exception, index) => (
                    <motion.tr
                      key={exception.id}
                      className='border-b border-slate-100 hover:bg-slate-50 transition-colors'
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <td className='px-4 py-3'>
                        <span
                          className={cn(
                            'inline-block rounded px-2.5 py-1 text-xs font-semibold',
                            getAlertBadgeStyles(exception.alertType)
                          )}
                        >
                          {getAlertLabel(exception.alertType)}
                        </span>
                      </td>
                      <td className='px-4 py-3 text-sm font-mono text-foreground'>
                        {exception.dealId}
                      </td>
                      <td className='px-4 py-3 text-sm text-foreground'>
                        <span className='max-w-xs'>{exception.reason}</span>
                      </td>
                      <td className='px-4 py-3 text-sm text-muted-foreground whitespace-nowrap'>
                        {exception.timestamp}
                      </td>
                      <td className='px-4 py-3 text-center'>
                        <Button
                          size='sm'
                          variant='default'
                          onClick={() => handleReviewDeal(exception.dealId)}
                          className='gap-2'
                        >
                          <Icons.eye className='h-4 w-4' strokeWidth={1.5} />
                          Review Deal
                        </Button>
                      </td>
                    </motion.tr>
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

export default function WorkbenchPage() {
  return (
    <motion.div
      className='space-y-8'
      variants={containerVariants}
      initial='hidden'
      animate='visible'
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <h1 className='text-display-3 font-bold tracking-tight text-brand-navy'>
          AI Workbench
        </h1>
        <p className='mt-2 text-lg text-muted-foreground'>
          Manual review queue for policy violations.
        </p>
      </motion.div>

      {/* Exception Queue */}
      <ExceptionQueue />
    </motion.div>
  )
}

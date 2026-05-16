'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { CardWatermark } from '@/components/ui/card-watermark'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { Label } from '@/components/ui/label'
import { apiClient } from '@/lib/api-client'
import { toast } from '@/components/ui/toast'

export default function AdminSettingsPage() {
  const { data: session, status: sessionStatus } = useSession()
  const router = useRouter()
  
  // Knowledge Trinity State
  const [salesPolicy, setSalesPolicy] = useState('')
  const [pipelineSop, setPipelineSop] = useState('')
  const [orgHierarchy, setOrgHierarchy] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)
  
  const isAdmin = session?.roles?.includes('admin')

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') router.push('/auth/signin')
  }, [sessionStatus, router])

  const handleSyncBrain = async () => {
    if (!salesPolicy.trim() || !pipelineSop.trim() || !orgHierarchy.trim()) {
      toast.error('Incomplete Knowledge Base', { 
        description: 'All three knowledge documents are required.' 
      })
      return
    }
    
    setIsSyncing(true)
    try {
      await apiClient.post('/api/v1/nexus/ingest-knowledge', {
        sales_policy: salesPolicy,
        pipeline_sop: pipelineSop,
        org_hierarchy: orgHierarchy,
      })
      
      toast.success('Aegis Brain Updated', { 
        description: 'Orchestrator is now policy-aware.' 
      })
      
      // Clear fields after successful sync
      setSalesPolicy('')
      setPipelineSop('')
      setOrgHierarchy('')
    } catch (error) {
      toast.error('Sync Failed', { 
        description: error instanceof Error ? error.message : 'Could not connect to Supervity.' 
      })
    } finally {
      setIsSyncing(false)
    }
  }

  if (sessionStatus === 'loading') {
    return (
      <div className='flex h-full items-center justify-center'>
        <Icons.loader className='h-8 w-8 animate-spin text-brand-cornflower' />
      </div>
    )
  }

  if (!isAdmin) return null

  return (
    <div className='space-y-8'>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className='text-display-4 font-bold text-brand-navy'>Knowledge Trinity Ingestion</h1>
        <p className='text-muted-foreground mt-2'>This is the only way Aegis learns. Three documents. One powerful brain.</p>
      </motion.div>

      {/* Knowledge Trinity Card */}
      <Card className='relative overflow-hidden'>
        <CardWatermark opacity={5} scale={1.2} />
        <CardHeader className='relative z-10'>
          <CardTitle className='flex items-center gap-2 text-brand-navy'>
            <Icons.brain className='h-6 w-6 text-brand-cornflower' />
            Aegis Brain Configuration
          </CardTitle>
          <CardDescription>
            Train your AI orchestrator with corporate policies, sales procedures, and organizational structure.
          </CardDescription>
        </CardHeader>
        <CardContent className='relative z-10 space-y-6'>
          
          {/* Field 1: Corporate Sales & Discount Policy */}
          <motion.div 
            className='space-y-3'
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            <Label htmlFor='sales-policy' className='text-base font-semibold text-brand-navy'>
              Corporate Sales & Discount Policy
            </Label>
            <textarea
              id='sales-policy'
              value={salesPolicy}
              onChange={(e) => setSalesPolicy(e.target.value)}
              placeholder='Paste your corporate sales policy, discount authorization matrix, and deal restrictions here...'
              disabled={isSyncing}
              className='w-full h-48 p-4 rounded-lg border border-border bg-background text-sm placeholder-muted-foreground disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-brand-cornflower focus:ring-offset-2 transition-all resize-none'
            />
          </motion.div>

          {/* Field 2: Sales Pipeline SOP */}
          <motion.div 
            className='space-y-3'
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          >
            <Label htmlFor='pipeline-sop' className='text-base font-semibold text-brand-navy'>
              Sales Pipeline SOP
            </Label>
            <textarea
              id='pipeline-sop'
              value={pipelineSop}
              onChange={(e) => setPipelineSop(e.target.value)}
              placeholder='Paste your sales pipeline stages, process steps, and stage-exit criteria here...'
              disabled={isSyncing}
              className='w-full h-48 p-4 rounded-lg border border-border bg-background text-sm placeholder-muted-foreground disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-brand-cornflower focus:ring-offset-2 transition-all resize-none'
            />
          </motion.div>

          {/* Field 3: Organization Hierarchy */}
          <motion.div 
            className='space-y-3'
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
          >
            <Label htmlFor='org-hierarchy' className='text-base font-semibold text-brand-navy'>
              Organization Hierarchy
            </Label>
            <textarea
              id='org-hierarchy'
              value={orgHierarchy}
              onChange={(e) => setOrgHierarchy(e.target.value)}
              placeholder='Paste your organizational structure, reporting lines, and approval authorities here...'
              disabled={isSyncing}
              className='w-full h-48 p-4 rounded-lg border border-border bg-background text-sm placeholder-muted-foreground disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-brand-cornflower focus:ring-offset-2 transition-all resize-none'
            />
          </motion.div>

          {/* Sync Button */}
          <motion.div 
            className='flex justify-end pt-6 border-t border-border'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.4 }}
          >
            <Button
              onClick={handleSyncBrain}
              disabled={isSyncing || !salesPolicy.trim() || !pipelineSop.trim() || !orgHierarchy.trim()}
              variant='gradient'
              className='flex items-center gap-2'
            >
              {isSyncing ? (
                <>
                  <motion.div
                    className='h-4 w-4 rounded-full border-2 border-white border-t-transparent'
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  />
                  Syncing...
                </>
              ) : (
                <>
                  <Icons.sparkles className='h-4 w-4' />
                  Sync Aegis Brain
                </>
              )}
            </Button>
          </motion.div>
        </CardContent>
      </Card>

      {/* Info Section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        className='rounded-lg border border-border bg-muted/30 p-4'
      >
        <h3 className='font-semibold text-brand-navy mb-2 flex items-center gap-2'>
          <Icons.lightbulb className='h-4 w-4 text-brand-cornflower' />
          How the Aegis Brain Works
        </h3>
        <ul className='space-y-2 text-sm text-muted-foreground'>
          <li>✓ The Orchestrator reads these three documents to understand your business rules.</li>
          <li>✓ Every deal is evaluated against these policies before approval.</li>
          <li>✓ Updates here instantly retrain the entire AI engine.</li>
          <li>✓ No manual governance—pure policy-driven intelligence.</li>
        </ul>
      </motion.div>
    </div>
  )
}
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
  
  // Knowledge Ingestion State
  const [knowledgeText, setKnowledgeText] = useState('')
  const [docType, setDocType] = useState('sales_policy')
  const [isSyncing, setIsSyncing] = useState(false)
  
  const isAdmin = session?.roles?.includes('admin')

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') router.push('/auth/signin')
  }, [sessionStatus, router])

  const handleSyncKnowledge = async () => {
    if (!knowledgeText.trim()) return
    setIsSyncing(true)
    try {
      await apiClient.post('/api/v1/nexus/ingest-knowledge', {
        document_content: knowledgeText,
        document_type: docType,
        source: 'Manual Executive Upload'
      })
      toast.success('Supervity Brain Updated', { 
        description: 'Corporate policies have been synced and cached.' 
      })
      setKnowledgeText('')
    } catch (err) {
      toast.error('Sync Failed', { 
        description: 'Could not connect to Supervity Ingestion Ops.' 
      })
    } finally {
      setIsSyncing(false)
    }
  }

  if (sessionStatus === 'loading') {
    return <div className='flex h-full items-center justify-center'><Icons.loader className='h-8 w-8 animate-spin text-brand-cornflower' /></div>
  }

  if (!isAdmin) return null

  return (
    <div className='space-y-6'>
      <h1 className='text-display-4 font-bold text-brand-navy'>Admin Settings</h1>

      {/* Knowledge Ingestion Card */}
      <Card className='relative overflow-hidden'>
        <CardWatermark opacity={5} scale={1.2} />
        <CardHeader className='relative z-10'>
          <CardTitle className='flex items-center gap-2 text-brand-navy'>
            <Icons.brain className='h-5 w-5 text-brand-cornflower' />
            Knowledge Base Ingestion
          </CardTitle>
          <CardDescription>Paste raw corporate documents to train the Aegis-Nexus brain live.</CardDescription>
        </CardHeader>
        <CardContent className='relative z-10 space-y-4'>
          <textarea
            value={knowledgeText}
            onChange={(e) => setKnowledgeText(e.target.value)}
            placeholder="Paste raw Policy text here (e.g. Corporate Sales & Discount Policy 2026)..."
            className="w-full min-h-[250px] p-4 rounded-xl border border-border bg-white text-sm focus:ring-2 focus:ring-brand-cornflower/50 outline-none transition-all"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Label className="text-brand-navy font-semibold">Document Type:</Label>
              <select 
                value={docType} 
                onChange={(e) => setDocType(e.target.value)}
                className="bg-gray-50 border border-gray-300 text-brand-navy text-sm rounded-lg p-2 focus:ring-brand-cornflower outline-none"
              >
                <option value="sales_policy">Sales Policy</option>
                <option value="org_hierarchy">Org Hierarchy</option>
                <option value="pipeline_sop">Pipeline SOP</option>
              </select>
            </div>
            <Button variant="gradient" onClick={handleSyncKnowledge} disabled={isSyncing || !knowledgeText}>
              {isSyncing ? <Icons.loader className="animate-spin mr-2 h-4 w-4" /> : <Icons.sparkles className="mr-2 h-4 w-4" />}
              Sync to Supervity AI
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
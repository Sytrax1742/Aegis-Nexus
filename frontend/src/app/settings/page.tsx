'use client'

import { useEffect, useRef, useState } from 'react'
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
  
  // File Upload State
  const [policyFile, setPolicyFile] = useState<File | null>(null)
  const [sopFile, setSopFile] = useState<File | null>(null)
  const [hierarchyFile, setHierarchyFile] = useState<File | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [ingestionResult, setIngestionResult] = useState<any | null>(null)
  
  // File input refs
  const policyFileInputRef = useRef<HTMLInputElement>(null)
  const sopFileInputRef = useRef<HTMLInputElement>(null)
  const hierarchyFileInputRef = useRef<HTMLInputElement>(null)
  
  const isAdmin = session?.roles?.includes('admin')
  const syncTimeoutMs = 120000

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') router.push('/auth/signin')
  }, [sessionStatus, router])

  const handleFileChange = (file: File | null, setFile: (f: File | null) => void) => {
    if (file && ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.type)) {
      setFile(file)
    } else if (file) {
      toast.error('Invalid File Type', { 
        description: 'Please upload a .pdf, .txt, or .doc file.' 
      })
    }
  }

  const handleSyncBrain = async () => {
    if (!policyFile || !sopFile || !hierarchyFile) {
      toast.error('Incomplete Knowledge Base', { 
        description: 'All three document files are required.' 
      })
      return
    }
    
    setIsSyncing(true)
    try {
      const controller = new AbortController()
      const timeoutId = window.setTimeout(() => controller.abort(), syncTimeoutMs)

      const formData = new FormData()
      formData.append('sales_policy_file', policyFile)
      formData.append('pipeline_sop_file', sopFile)
      formData.append('org_hierarchy_file', hierarchyFile)

      const res = await apiClient.post<any>('/api/v1/nexus/ingest-knowledge', formData, {
        signal: controller.signal,
      })

      // Capture the full JSON response so the UI can show the Supervity output
      setIngestionResult(res)
      window.localStorage.setItem('aegis:last-ingestion-result', JSON.stringify(res))
      window.dispatchEvent(new CustomEvent('aegis:ingestion-updated', { detail: res }))

      window.clearTimeout(timeoutId)
      
      toast.success(res?.message || 'Aegis Brain Updated', { 
        description: res?.data ? 'Aegis Brain is now loaded with Corporate Policy 2026.' : 'Aegis Brain Updated'
      })
      
      // Clear files after successful sync
      setPolicyFile(null)
      setSopFile(null)
      setHierarchyFile(null)
      if (policyFileInputRef.current) policyFileInputRef.current.value = ''
      if (sopFileInputRef.current) sopFileInputRef.current.value = ''
      if (hierarchyFileInputRef.current) hierarchyFileInputRef.current.value = ''
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        toast.error('Sync Still Processing', {
          description: 'The cloud sync is still running. Try again in a moment.',
        })
        return
      }

      const responseBody = error instanceof Error ? (error as any).response?.body : null
      if (responseBody) {
        setIngestionResult(responseBody)
        window.localStorage.setItem('aegis:last-ingestion-result', JSON.stringify(responseBody))
        window.dispatchEvent(new CustomEvent('aegis:ingestion-updated', { detail: responseBody }))
      }

      toast.error('Sync Failed', {
        description: error instanceof Error ? error.message : 'Could not connect to Supervity.',
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
          
          {/* File Upload 1: Corporate Sales & Discount Policy */}
          <motion.div 
            className='space-y-3'
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            <Label htmlFor='policy-file' className='text-base font-semibold text-brand-navy'>
              Corporate Sales & Discount Policy
            </Label>
            <div className='border-2 border-dashed border-border rounded-lg p-6 bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer'
              onClick={() => policyFileInputRef.current?.click()}
            >
              <input
                ref={policyFileInputRef}
                type='file'
                accept='.pdf,.txt,.doc,.docx'
                onChange={(e) => handleFileChange(e.target.files?.[0] || null, setPolicyFile)}
                className='hidden'
                disabled={isSyncing}
              />
              <div className='flex flex-col items-center gap-2'>
                <Icons.upload className='h-8 w-8 text-muted-foreground' />
                {policyFile ? (
                  <div className='text-center'>
                    <p className='text-sm font-medium text-foreground'>{policyFile.name}</p>
                    <p className='text-xs text-muted-foreground'>{(policyFile.size / 1024).toFixed(2)} KB</p>
                  </div>
                ) : (
                  <div className='text-center'>
                    <p className='text-sm font-medium text-foreground'>Drop file here or click</p>
                    <p className='text-xs text-muted-foreground'>PDF, TXT, or DOC</p>
                  </div>
                )}
                <Button variant='outline' size='sm' type='button' disabled={isSyncing}>
                  Choose File
                </Button>
              </div>
            </div>
          </motion.div>

          {/* File Upload 2: Sales Pipeline SOP */}
          <motion.div 
            className='space-y-3'
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          >
            <Label htmlFor='sop-file' className='text-base font-semibold text-brand-navy'>
              Sales Pipeline SOP
            </Label>
            <div className='border-2 border-dashed border-border rounded-lg p-6 bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer'
              onClick={() => sopFileInputRef.current?.click()}
            >
              <input
                ref={sopFileInputRef}
                type='file'
                accept='.pdf,.txt,.doc,.docx'
                onChange={(e) => handleFileChange(e.target.files?.[0] || null, setSopFile)}
                className='hidden'
                disabled={isSyncing}
              />
              <div className='flex flex-col items-center gap-2'>
                <Icons.upload className='h-8 w-8 text-muted-foreground' />
                {sopFile ? (
                  <div className='text-center'>
                    <p className='text-sm font-medium text-foreground'>{sopFile.name}</p>
                    <p className='text-xs text-muted-foreground'>{(sopFile.size / 1024).toFixed(2)} KB</p>
                  </div>
                ) : (
                  <div className='text-center'>
                    <p className='text-sm font-medium text-foreground'>Drop file here or click</p>
                    <p className='text-xs text-muted-foreground'>PDF, TXT, or DOC</p>
                  </div>
                )}
                <Button variant='outline' size='sm' type='button' disabled={isSyncing}>
                  Choose File
                </Button>
              </div>
            </div>
          </motion.div>

          {/* File Upload 3: Organization Hierarchy */}
          <motion.div 
            className='space-y-3'
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
          >
            <Label htmlFor='hierarchy-file' className='text-base font-semibold text-brand-navy'>
              Organization Hierarchy
            </Label>
            <div className='border-2 border-dashed border-border rounded-lg p-6 bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer'
              onClick={() => hierarchyFileInputRef.current?.click()}
            >
              <input
                ref={hierarchyFileInputRef}
                type='file'
                accept='.pdf,.txt,.doc,.docx'
                onChange={(e) => handleFileChange(e.target.files?.[0] || null, setHierarchyFile)}
                className='hidden'
                disabled={isSyncing}
              />
              <div className='flex flex-col items-center gap-2'>
                <Icons.upload className='h-8 w-8 text-muted-foreground' />
                {hierarchyFile ? (
                  <div className='text-center'>
                    <p className='text-sm font-medium text-foreground'>{hierarchyFile.name}</p>
                    <p className='text-xs text-muted-foreground'>{(hierarchyFile.size / 1024).toFixed(2)} KB</p>
                  </div>
                ) : (
                  <div className='text-center'>
                    <p className='text-sm font-medium text-foreground'>Drop file here or click</p>
                    <p className='text-xs text-muted-foreground'>PDF, TXT, or DOC</p>
                  </div>
                )}
                <Button variant='outline' size='sm' type='button' disabled={isSyncing}>
                  Choose File
                </Button>
              </div>
            </div>
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
              disabled={isSyncing || !policyFile || !sopFile || !hierarchyFile}
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

      {/* Ingestion Result */}
      {ingestionResult && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className='relative overflow-hidden'>
            <CardHeader>
              <CardTitle>Ingestion Result</CardTitle>
              <CardDescription>Raw response from knowledge ingestion (Supervity)</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className='whitespace-pre-wrap text-xs'>
                {JSON.stringify(ingestionResult, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  )
}
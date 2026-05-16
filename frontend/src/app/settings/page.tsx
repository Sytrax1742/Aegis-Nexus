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

// Sample document templates
const SAMPLE_SALES_POLICY = `CORPORATE SALES & DISCOUNT POLICY 2026

1. DISCOUNT AUTHORIZATION MATRIX
   - Manager Level: Up to 5% discount on base price
   - Director Level: Up to 10% discount on base price
   - VP Level: Up to 15% discount on base price
   - CEO/Board: Unlimited discretion with Board approval

2. DISCOUNT RULES
   - Volume discounts apply to orders >$100K (additional 2-3%)
   - Multi-year contracts: 5% per year locked in
   - Strategic partnerships: Case-by-case review
   - No discounts below 20% gross margin threshold

3. DEAL RESTRICTIONS
   - Annual customer discount cap: 15% cumulative
   - Minimum contract value: $50K
   - Payment terms: Net 30 standard, Net 15 for cash discount
   - Quarterly review required for high-risk customers

4. ESCALATION PROCEDURES
   - Discounts >10%: Requires VP approval and Business Case
   - Discounts >15%: Requires C-Suite approval
   - Discounts >20%: Requires Board notification`

const SAMPLE_PIPELINE_SOP = `SALES PIPELINE STANDARD OPERATING PROCEDURE

STAGE 1: DISCOVERY (Week 1-2)
- Initial qualification call (30 min)
- Document: Prospect profile, pain points, budget
- Owner: Sales Development Rep
- Success Criteria: Identify decision maker, confirm fit

STAGE 2: NEEDS ANALYSIS (Week 3-4)
- Solution architecture workshop with client stakeholders
- Document: Requirements, technical specifications
- Owner: Solution Consultant + Account Executive
- Success Criteria: Scope document signed

STAGE 3: PROPOSAL (Week 5-6)
- Prepare pricing, terms, implementation timeline
- Document: Formal proposal, ROI analysis
- Owner: Account Executive
- Success Criteria: Proposal sent, next meeting scheduled

STAGE 4: NEGOTIATION (Week 7-8)
- Contract review with Legal
- Resolve pricing, terms, support levels
- Owner: Account Executive + Legal
- Success Criteria: Contract signed

STAGE 5: DEAL CLOSE (Week 9)
- Final approvals, payment receipt
- Onboarding handoff to Customer Success
- Owner: Sales Operations
- Success Criteria: Deal recorded, implementation begins`

const SAMPLE_ORG_HIERARCHY = `ORGANIZATION HIERARCHY & AUTHORITY MATRIX

EXECUTIVE LEADERSHIP
- CEO: Sarah Chen | Sales Accountability | Final Authority >$1M
- VP Sales: Michael Torres | Enterprise Accounts | Authority >$250K
- VP Customer Success: Jennifer Park | Customer Retention | Authority >$100K

REGIONAL DIRECTORS
- West Region: David Kumar (VP-level authority)
- East Region: Lisa Washington (Director-level authority)
- International: Marcus Schmidt (Director-level authority)

SALES TEAMS
- Enterprise Account Executives: $250K+ deals
- Mid-Market Account Executives: $50K-$250K deals
- Sales Development Reps: Qualification & pipeline building

SUPPORT FUNCTIONS
- Legal & Contracts: Contract authority up to $500K
- Finance: Budget verification on all deals
- Operations: Deal registration and compliance

APPROVAL REQUIREMENTS BY DEAL SIZE
- <$50K: AE + Manager approval
- $50K-$250K: Director + VP approval
- $250K-$1M: VP + CFO approval
- >$1M: CEO approval required`

export default function AdminSettingsPage() {
  const { data: session, status: sessionStatus } = useSession()
  const router = useRouter()
  
  // Knowledge Ingestion State - Three Distinct Inputs
  const [salesPolicy, setSalesPolicy] = useState('')
  const [pipelineSop, setPipelineSop] = useState('')
  const [orgHierarchy, setOrgHierarchy] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)
  
  const isAdmin = session?.roles?.includes('admin')

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') router.push('/auth/signin')
  }, [sessionStatus, router])

  const handleSyncKnowledge = async () => {
    if (!salesPolicy.trim() || !pipelineSop.trim() || !orgHierarchy.trim()) {
      toast.error('Incomplete Knowledge Base', { 
        description: 'Please fill in all three documents before syncing.' 
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
      toast.success('Supervity Brain Updated', { 
        description: 'All three knowledge documents synced and cached.' 
      })
      setSalesPolicy('')
      setPipelineSop('')
      setOrgHierarchy('')
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
          <CardDescription>Train the Aegis-Nexus brain with three critical knowledge documents: corporate policies, sales procedures, and organizational structure.</CardDescription>
        </CardHeader>
        <CardContent className='relative z-10 space-y-6'>
          
          {/* Sales Policy Input */}
          <motion.div className='space-y-2' initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className='flex items-center justify-between'>
              <Label className='text-brand-navy font-semibold'>Corporate Sales Policy</Label>
              <Button 
                variant='outline' 
                size='sm'
                onClick={() => setSalesPolicy(SAMPLE_SALES_POLICY)}
                className='text-xs'
              >
                <Icons.copy className='h-3 w-3 mr-1' />
                Load Sample
              </Button>
            </div>
            <textarea
              value={salesPolicy}
              onChange={(e) => setSalesPolicy(e.target.value)}
              placeholder="Paste your corporate sales & discount policy here..."
              className="w-full h-40 p-4 rounded-xl border border-border bg-white/80 backdrop-blur-sm text-sm focus:ring-2 focus:ring-brand-cornflower/50 outline-none transition-all"
            />
          </motion.div>

          {/* Pipeline SOP Input */}
          <motion.div className='space-y-2' initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <div className='flex items-center justify-between'>
              <Label className='text-brand-navy font-semibold'>Sales Pipeline SOP</Label>
              <Button 
                variant='outline' 
                size='sm'
                onClick={() => setPipelineSop(SAMPLE_PIPELINE_SOP)}
                className='text-xs'
              >
                <Icons.copy className='h-3 w-3 mr-1' />
                Load Sample
              </Button>
            </div>
            <textarea
              value={pipelineSop}
              onChange={(e) => setPipelineSop(e.target.value)}
              placeholder="Paste your sales pipeline standard operating procedure here..."
              className="w-full h-40 p-4 rounded-xl border border-border bg-white/80 backdrop-blur-sm text-sm focus:ring-2 focus:ring-brand-cornflower/50 outline-none transition-all"
            />
          </motion.div>

          {/* Organization Hierarchy Input */}
          <motion.div className='space-y-2' initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <div className='flex items-center justify-between'>
              <Label className='text-brand-navy font-semibold'>Organization Hierarchy</Label>
              <Button 
                variant='outline' 
                size='sm'
                onClick={() => setOrgHierarchy(SAMPLE_ORG_HIERARCHY)}
                className='text-xs'
              >
                <Icons.copy className='h-3 w-3 mr-1' />
                Load Sample
              </Button>
            </div>
            <textarea
              value={orgHierarchy}
              onChange={(e) => setOrgHierarchy(e.target.value)}
              placeholder="Paste your organization hierarchy and approval matrix here..."
              className="w-full h-40 p-4 rounded-xl border border-border bg-white/80 backdrop-blur-sm text-sm focus:ring-2 focus:ring-brand-cornflower/50 outline-none transition-all"
            />
          </motion.div>

          {/* Sync Button */}
          <div className='flex justify-end pt-4'>
            <Button 
              variant="gradient" 
              onClick={handleSyncKnowledge} 
              disabled={isSyncing || !salesPolicy.trim() || !pipelineSop.trim() || !orgHierarchy.trim()}
              className='flex items-center gap-2'
            >
              {isSyncing ? (
                <>
                  <Icons.loader className="animate-spin h-4 w-4" />
                  Syncing Knowledge...
                </>
              ) : (
                <>
                  <Icons.sparkles className="h-4 w-4" />
                  Sync All to Supervity AI
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
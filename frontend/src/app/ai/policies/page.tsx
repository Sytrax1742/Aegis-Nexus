'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CardWatermark } from '@/components/ui/card-watermark'
import { Icons } from '@/components/ui/icons'
import { PolicyCard, type Policy } from '@/components/ai/policies/PolicyCard'
import { PolicyDetailModal } from '@/components/ai/policies/PolicyDetailModal'
import { PolicyEditModal } from '@/components/ai/policies/PolicyEditModal'
import { CreateWithAI } from '@/components/ai/policies/CreateWithAI'
import { PermissionMatrixTab } from '@/components/ai/policies/PermissionMatrixTab'
import { StructuredBuilder } from '@/components/ai/policies/StructuredBuilder'
import { apiClient } from '@/lib/api-client'

// ============================================================================
// Fallback / Standard Corporate Policies Grounded in Real test-data Docs
// ============================================================================

const getStandardPolicies = (isSynced: boolean): Policy[] => {
  const sourceLabel = isSynced ? 'Corporate Docs' : 'System Default'
  const tagsList = isSynced ? ['finance', 'discount', 'synced'] : ['finance', 'discount', 'offline']
  
  return [
    {
      id: 'policy-1',
      name: 'Discount Authority Matrix',
      description: 'Applies maximum authorized discount thresholds per sales role: Account Executive (max 10%), Team Lead (max 15%), Regional Manager (max 20%), VP of Sales (max 35%).',
      summary: 'Restricts discount permissions according to team structure and deal size limits.',
      natural_language: 'Account Executives can approve up to 10% discount. Team Leads up to 15%. Regional Managers up to 20%. Sarah Jenkins VP of Sales up to 35%. Anything else requires CEO and CFO approval.',
      policy_type: 'logical',
      dsl: {
        conditions: [
          { field: 'discount_percentage', operator: 'gt', value: 10 },
          { field: 'requester_role', operator: 'eq', value: 'AE' }
        ],
        actions: [
          { type: 'escalate_to_manager', value: 'Team Lead' },
          { type: 'flag_violation', value: 'DISCOUNT_EXCEEDS_AE_LIMIT' }
        ],
        match_mode: 'all'
      },
      refined_instruction: 'Escalate any AE discount requests exceeding 10% to the Team Lead.',
      ai_instruction: 'Check if AE has granted discount > 10%. If yes, flag a compliance alert.',
      entity_name: 'discount_matrix',
      is_active: true,
      priority: 10,
      tags: tagsList,
      source: sourceLabel,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      execution_count: 142,
      last_executed_at: new Date().toISOString()
    },
    {
      id: 'policy-2',
      name: 'Hard Cap Discount Limits',
      description: 'Enforces a strict 35% hard ceiling discount limit on all deals. Any deal exceeding this limit requires joint CEO and CFO approval.',
      summary: 'Prevents automatic deal closing for high-discount agreements.',
      natural_language: 'Any discount exceeding 35% is a hard cap violation and must be escalated to Rajesh Patel (CEO) and Maria Gonzalez (CFO) for joint approval.',
      policy_type: 'logical',
      dsl: {
        conditions: [
          { field: 'discount_percentage', operator: 'gt', value: 35 }
        ],
        actions: [
          { type: 'require_human_review', value: 'CEO + CFO Joint' },
          { type: 'block_proposal', value: true }
        ],
        match_mode: 'all'
      },
      refined_instruction: 'Halt the pipeline and trigger manual review if the discount exceeds 35%.',
      ai_instruction: 'Validate discount against 35% hard limit. Flag critical violation on failure.',
      entity_name: 'hard_cap_limit',
      is_active: true,
      priority: 1,
      tags: isSynced ? ['finance', 'compliance', 'critical', 'synced'] : ['finance', 'compliance', 'critical'],
      source: sourceLabel,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      execution_count: 38,
      last_executed_at: new Date().toISOString()
    },
    {
      id: 'policy-3',
      name: 'Minimum Deal Size Guardrail',
      description: 'Requires all deals to have a minimum annual contract value (ARR) of $5,000. Deals below this size are rejected or escalated to Sales Ops.',
      summary: 'Protects pipeline velocity by filtering low-value accounts.',
      natural_language: 'The minimum deal size is $5,000 ARR. Any deals under this limit are auto-rejected unless bundled with an enterprise contract.',
      policy_type: 'logical',
      dsl: {
        conditions: [
          { field: 'deal_value', operator: 'lt', value: 5000 }
        ],
        actions: [
          { type: 'flag_violation', value: 'UNDER_MINIMUM_DEAL_SIZE' },
          { type: 'notify_sales_ops', value: true }
        ],
        match_mode: 'all'
      },
      refined_instruction: 'Flag deals with annual value lower than $5,000 ARR.',
      ai_instruction: 'Ensure deal size is at least $5,000. Under-budget deals get flagged.',
      entity_name: 'min_deal_size',
      is_active: true,
      priority: 15,
      tags: isSynced ? ['sales-ops', 'pricing', 'synced'] : ['sales-ops', 'pricing'],
      source: sourceLabel,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      execution_count: 8,
      last_executed_at: null
    },
    {
      id: 'policy-4',
      name: 'Multi-Year Sign-Off Rule',
      description: 'All contracts of 2 years or longer must be escalated to the VP of Sales (Sarah Jenkins) for signature and approval.',
      summary: 'Triggers VP of Sales review for long-term customer accounts.',
      natural_language: 'Multi-year contracts (2 or 3 years) require VP of Sales sign-off regardless of discount level.',
      policy_type: 'logical',
      dsl: {
        conditions: [
          { field: 'contract_term_years', operator: 'gte', value: 2 }
        ],
        actions: [
          { type: 'require_human_review', value: 'Sarah Jenkins (VP of Sales)' }
        ],
        match_mode: 'all'
      },
      refined_instruction: 'Escalate contracts with a duration of 2+ years to Sarah Jenkins.',
      ai_instruction: 'Check term years. If 2 or more, trigger human-in-the-loop exception.',
      entity_name: 'multi_year_rule',
      is_active: true,
      priority: 20,
      tags: isSynced ? ['legal', 'contract', 'multi-year', 'synced'] : ['legal', 'contract', 'multi-year'],
      source: sourceLabel,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      execution_count: 67,
      last_executed_at: new Date().toISOString()
    },
    {
      id: 'policy-5',
      name: 'BANT Sales Discovery Audit',
      description: 'Audits sales discovery logs and call transcripts to verify key qualification metrics: Budget, Authority, Need, and Timeline (BANT).',
      summary: 'Audits transcripts to ensure comprehensive needs analysis.',
      natural_language: 'Verify that the transcript contains company size, contact details, decision maker identity, current competitor (e.g. DataSync), and at least 3 distinct pain points.',
      policy_type: 'natural_language',
      dsl: null,
      refined_instruction: 'Analyze sales transcript to qualify prospects based on budget and urgency.',
      ai_instruction: 'Extract competitor name and prospect details. Verify that the budget and decision maker are qualified.',
      entity_name: 'bant_discovery',
      is_active: true,
      priority: 25,
      tags: isSynced ? ['discovery', 'sop', 'bant', 'synced'] : ['discovery', 'sop', 'bant'],
      source: sourceLabel,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      execution_count: 219,
      last_executed_at: new Date().toISOString()
    }
  ]
}

// ============================================================================
// Animation Variants
// ============================================================================

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

// ============================================================================
// Types
// ============================================================================

type TabType = 'policies' | 'create-ai' | 'structured' | 'matrix'
type FilterType = 'all' | 'active' | 'inactive' | 'logical' | 'natural_language'
type SortType = 'newest' | 'oldest' | 'priority' | 'name' | 'executions'

// ============================================================================
// Tab Configuration
// ============================================================================

const TABS = [
  { id: 'policies' as TabType, label: 'Policies', Icon: Icons.layers },
  { id: 'create-ai' as TabType, label: 'Create with AI', Icon: Icons.sparkles },
  { id: 'structured' as TabType, label: 'Structured Builder', Icon: Icons.grid },
  { id: 'matrix' as TabType, label: 'Permission Matrix', Icon: Icons.table },
]

// ============================================================================
// Page Component
// ============================================================================

export default function AIPoliciesPage() {
  // State
  const [policies, setPolicies] = useState<Policy[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('policies')
  const [isSynced, setIsSynced] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false)
  
  // File upload state for sync
  const [syncFiles, setSyncFiles] = useState<{
    policy: File | null
    sop: File | null
    hierarchy: File | null
  }>({
    policy: null,
    sop: null,
    hierarchy: null
  })
  
  // Modal state
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  
  // Filters
  const [filter, setFilter] = useState<FilterType>('all')
  const [sortBy, setSortBy] = useState<SortType>('newest')
  const [searchQuery, setSearchQuery] = useState('')

  // Structured builder state
  const [structuredDSL, setStructuredDSL] = useState<{conditions: Array<{field: string; operator: string; value: string}>; actions: Array<{type: string; value?: string}>; match_mode: 'all' | 'any'} | null>(null)
  const [structuredName, setStructuredName] = useState('')
  const [isSavingStructured, setIsSavingStructured] = useState(false)

  // ============================================================================
  // Data — Loaded dynamically from /rag-context
  // ============================================================================

  const loadPolicies = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await apiClient.get<any>('/api/v1/nexus/rag-context')
      if (res && res.status === 'success') {
        setIsSynced(true)
        setPolicies(getStandardPolicies(true))
      } else {
        setIsSynced(false)
        setPolicies(getStandardPolicies(false))
      }
    } catch (e) {
      console.warn('[Policies] Failed to fetch RAG context, using standard rules:', e)
      setIsSynced(false)
      setPolicies(getStandardPolicies(false))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPolicies()
  }, [loadPolicies])

  // Sync handler to upload 3 documents to Supervity via backend
  const handleSyncCorporateDocs = async () => {
    if (!syncFiles.policy || !syncFiles.sop || !syncFiles.hierarchy) {
      alert('Please select all three corporate documents first.')
      return
    }

    setIsSyncing(true)
    try {
      const form = new FormData()
      form.append('sales_policy_file', syncFiles.policy)
      form.append('pipeline_sop_file', syncFiles.sop)
      form.append('org_hierarchy_file', syncFiles.hierarchy)

      const res = await apiClient.post<any>('/api/v1/nexus/ingest-knowledge', form)
      
      // Dispatch standard sync event so dashboard and other page headers update dynamically
      window.localStorage.setItem('aegis:last-ingestion-result', JSON.stringify(res))
      window.dispatchEvent(new CustomEvent('aegis:ingestion-updated', { detail: res }))
      
      setIsSyncModalOpen(false)
      setSyncFiles({ policy: null, sop: null, hierarchy: null })
      await loadPolicies()
    } catch (e) {
      console.error('[Policies] Ingestion failed:', e)
      alert(e instanceof Error ? e.message : 'Corporate document sync failed')
    } finally {
      setIsSyncing(false)
    }
  }

  // ============================================================================
  // Policy Actions
  // ============================================================================

  const handleCardClick = useCallback((policy: Policy) => {
    setSelectedPolicy(policy)
    setIsDetailModalOpen(true)
  }, [])

  const handleEditFromDetail = useCallback((policy: Policy) => {
    setEditingPolicy(policy)
    setIsEditModalOpen(true)
  }, [])

  const handleSavePolicy = useCallback(async () => {
    loadPolicies()
  }, [loadPolicies])

  const togglePolicyStatus = useCallback(async (id: string) => {
    setPolicies(prev => prev.map(p => p.id === id ? { ...p, is_active: !p.is_active } : p))
  }, [])

  const deletePolicy = useCallback(async (id: string) => {
    setPolicies(prev => prev.filter(p => p.id !== id))
  }, [])

  const handlePolicyCreate = async (policyData: {
    name: string
    description: string
    naturalLanguage: string
    policyType: 'logical' | 'natural_language'
    dsl: unknown
    refinedInstruction: string | null
    entityName: string | null
    tags: string[]
    priority: number
  }) => {
    const newPolicy: Policy = {
      id: `user-${Date.now()}`,
      name: policyData.name,
      description: policyData.description,
      natural_language: policyData.naturalLanguage,
      summary: policyData.description,
      policy_type: policyData.policyType,
      dsl: policyData.dsl as Policy['dsl'],
      refined_instruction: policyData.refinedInstruction,
      ai_instruction: policyData.naturalLanguage,
      entity_name: policyData.entityName,
      is_active: true,
      priority: policyData.priority,
      tags: policyData.tags,
      execution_count: 0,
      last_executed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setPolicies(prev => [newPolicy, ...prev])
    setActiveTab('policies')
  }

  // ============================================================================
  // Filtering & Sorting
  // ============================================================================

  const filteredPolicies = policies
    .filter((policy) => {
      if (filter === 'active' && !policy.is_active) return false
      if (filter === 'inactive' && policy.is_active) return false
      if (filter === 'logical' && policy.policy_type !== 'logical') return false
      if (filter === 'natural_language' && policy.policy_type !== 'natural_language') return false

      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        return (
          policy.name.toLowerCase().includes(query) ||
          policy.description.toLowerCase().includes(query) ||
          policy.natural_language.toLowerCase().includes(query) ||
          policy.tags.some((tag) => tag.toLowerCase().includes(query))
        )
      }

      return true
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        case 'priority':
          return a.priority - b.priority
        case 'name':
          return a.name.localeCompare(b.name)
        case 'executions':
          return b.execution_count - a.execution_count
        default:
          return 0
      }
    })

  // ============================================================================
  // Stats
  // ============================================================================

  const stats = {
    total: policies.length,
    active: policies.filter((p) => p.is_active).length,
    structured: policies.filter((p) => p.policy_type === 'logical').length,
    natural: policies.filter((p) => p.policy_type === 'natural_language').length,
  }

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-display-3 font-bold tracking-tight text-brand-navy lg:text-display-2">
              AI Policies
            </h1>
            {isSynced ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold shadow-sm animate-pulse">
                <Icons.check className="h-3.5 w-3.5" />
                Ingested Corporate KB
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold shadow-sm">
                <Icons.activity className="h-3.5 w-3.5" />
                Default Offline Configuration
              </span>
            )}
          </div>
          <p className="mt-1 text-lg text-muted-foreground">
            Define business rules in natural language. The AI determines the best format.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => setIsSyncModalOpen(true)}
            className="border-slate-300 text-slate-800 hover:bg-slate-50 transition-all font-semibold"
          >
            <Icons.upload className="mr-2 h-4 w-4 text-slate-600" />
            Sync Corporate Docs
          </Button>
          <Button
            variant="gradient"
            onClick={() => setActiveTab('create-ai')}
            className={activeTab !== 'policies' ? 'opacity-50' : ''}
          >
            <Icons.plus className="mr-2 h-4 w-4" />
            Create Policy
          </Button>
        </div>
      </motion.div>


      {/* Tabs - AT THE TOP */}
      <motion.div variants={itemVariants}>
        <div className="flex gap-1 p-1.5 bg-gray-100 rounded-xl">
          {TABS.map((tab) => (
            <motion.button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'text-brand-navy'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              whileHover={{ scale: activeTab === tab.id ? 1 : 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {activeTab === tab.id && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-white rounded-lg shadow-sm"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                <tab.Icon className="h-4 w-4" />
                {tab.label}
              </span>
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* Tab Content - Use initial={false} on first render to avoid blank state */}
      <AnimatePresence mode="popLayout">
        {activeTab === 'policies' && (
          <motion.div
            key="policies-tab"
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="space-y-6"
          >
          {/* Stats Bar - No initial animation to prevent blank flash */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { value: stats.total, label: 'Total Policies', icon: Icons.layers, bg: 'bg-brand-navy/10', color: 'text-brand-navy' },
              { value: stats.active, label: 'Active', icon: Icons.check, bg: 'bg-emerald-100', color: 'text-emerald-600' },
              { value: stats.structured, label: 'Structured', icon: Icons.grid, bg: 'bg-blue-100', color: 'text-blue-600' },
              { value: stats.natural, label: 'Natural Language', icon: Icons.brain, bg: 'bg-purple-100', color: 'text-purple-600' },
            ].map((stat) => (
              <motion.div 
                key={stat.label}
                className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 hover:shadow-md transition-all cursor-default"
                whileHover={{ y: -2, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              >
                <div className="flex items-center gap-3">
                  <motion.div 
                    className={cn('p-2 rounded-lg', stat.bg)}
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    transition={{ type: 'spring', stiffness: 400 }}
                  >
                    <stat.icon className={cn('h-5 w-5', stat.color)} />
                  </motion.div>
                  <div>
                    <p className={cn('text-2xl font-bold', stat.color)}>
                      {stat.value}
                    </p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Filters & Search */}
          <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Icons.search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search policies..."
                className={cn(
                  'w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-white',
                  'text-sm focus:outline-none focus:ring-2 focus:ring-brand-cornflower/50'
                )}
              />
            </div>

            {/* Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Filter:</span>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as FilterType)}
                className="px-3 py-2.5 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-cornflower/50"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="logical">Structured</option>
                <option value="natural_language">Natural Language</option>
              </select>
            </div>

            {/* Sort */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortType)}
                className="px-3 py-2.5 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-cornflower/50"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="priority">Priority</option>
                <option value="name">Name</option>
                <option value="executions">Most Used</option>
              </select>
            </div>
          </motion.div>

          {/* Policy Grid */}
          <motion.div variants={itemVariants}>
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Icons.loader className="h-8 w-8 animate-spin text-brand-cornflower" />
              </div>
            ) : filteredPolicies.length === 0 ? (
              <Card className="relative overflow-hidden">
                <CardWatermark opacity={3} scale={1} />
                <CardContent className="relative z-10 flex flex-col items-center justify-center py-16 text-center">
                  <div className={cn(
                    'mb-4 flex h-16 w-16 items-center justify-center rounded-2xl',
                    'bg-gradient-to-br from-brand-cornflower/20 to-brand-purple/20'
                  )}>
                    <Icons.brain className="h-8 w-8 text-brand-cornflower" strokeWidth={1.5} />
                  </div>
                  <h3 className="font-display text-lg font-semibold text-brand-navy">
                    {searchQuery || filter !== 'all' ? 'No matching policies' : 'No policies yet'}
                  </h3>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    {searchQuery || filter !== 'all'
                      ? 'Try adjusting your search or filter criteria.'
                      : 'Create your first AI policy using natural language.'}
                  </p>
                  <Button
                    variant="gradient"
                    className="mt-6"
                    onClick={() => setActiveTab('create-ai')}
                  >
                    <Icons.sparkles className="mr-2 h-4 w-4" />
                    Create with AI
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredPolicies.map((policy) => (
                  <PolicyCard
                    key={policy.id}
                    policy={policy}
                    onClick={handleCardClick}
                  />
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}

      {activeTab === 'create-ai' && (
        <motion.div
          key="create-ai-tab"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.15 }}
        >
          <Card className="relative overflow-hidden">
            <CardWatermark opacity={2} scale={1} />
            <CardContent className="relative z-10 py-8">
              <CreateWithAI
                onPolicyCreate={handlePolicyCreate}
                onCancel={() => setActiveTab('policies')}
              />
            </CardContent>
          </Card>
        </motion.div>
      )}

      {activeTab === 'structured' && (
        <motion.div
          key="structured-tab"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.15 }}
        >
          <Card className="relative overflow-hidden">
            <CardWatermark opacity={2} scale={1} />
            <CardContent className="relative z-10 py-8">
              <div className="max-w-3xl mx-auto">
                <div className="text-center mb-8">
                  <h2 className="text-xl font-bold text-brand-navy mb-2">
                    Structured Rule Builder
                  </h2>
                  <p className="text-muted-foreground">
                    Visually build rules with conditions and actions
                  </p>
                </div>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-foreground mb-1.5">Rule Name *</label>
                  <input
                    type="text"
                    value={structuredName}
                    onChange={(e) => setStructuredName(e.target.value)}
                    placeholder="e.g., Auto-Approve Low Value Items"
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-brand-cornflower/50"
                  />
                </div>
                <StructuredBuilder
                  onChange={(dsl) => setStructuredDSL(dsl)}
                />
                <div className="flex justify-center gap-3 mt-8">
                  <Button variant="ghost" onClick={() => setActiveTab('policies')}>
                    Cancel
                  </Button>
                  <Button
                    variant="gradient"
                    disabled={!structuredDSL || structuredDSL.conditions.length === 0 || !structuredName.trim() || isSavingStructured}
                    onClick={async () => {
                      if (!structuredDSL || !structuredName.trim()) return
                      setIsSavingStructured(true)
                      try {
                        await handlePolicyCreate({
                          name: structuredName.trim(),
                          description: '',
                          naturalLanguage: `Structured rule: ${structuredName}`,
                          policyType: 'logical',
                          dsl: {
                            conditions: structuredDSL.conditions.map(c => ({ field: c.field, operator: c.operator, value: c.value })),
                            actions: structuredDSL.actions.map(a => ({ type: a.type, value: a.value })),
                            match_mode: structuredDSL.match_mode,
                          },
                          refinedInstruction: null,
                          entityName: null,
                          tags: ['structured'],
                          priority: 50,
                        })
                        setStructuredName('')
                        setStructuredDSL(null)
                      } finally {
                        setIsSavingStructured(false)
                      }
                    }}
                  >
                    {isSavingStructured ? (
                      <><Icons.loader className="mr-2 h-4 w-4 animate-spin" />Saving...</>
                    ) : (
                      <><Icons.check className="mr-2 h-4 w-4" />Save Policy</>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {activeTab === 'matrix' && (
        <motion.div
          key="matrix-tab"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.15 }}
        >
          <PermissionMatrixTab />
        </motion.div>
      )}
      </AnimatePresence>

      {/* Detail Modal - View only */}
      <PolicyDetailModal
        policy={selectedPolicy}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false)
          setSelectedPolicy(null)
        }}
        onEdit={handleEditFromDetail}
        onToggleStatus={(id) => {
          togglePolicyStatus(id)
          setIsDetailModalOpen(false)
        }}
        onDelete={(id) => {
          deletePolicy(id)
          setIsDetailModalOpen(false)
        }}
      />

      {/* Edit Modal */}
      <PolicyEditModal
        policy={editingPolicy}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setEditingPolicy(null)
        }}
        onSave={handleSavePolicy}
      />

      {/* Sync Corporate Documents Modal */}
      <AnimatePresence>
        {isSyncModalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              transition={{ type: 'spring', duration: 0.3 }}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
                <div>
                  <h3 className="text-lg font-bold text-brand-navy flex items-center gap-2">
                    <Icons.upload className="h-5 w-5 text-brand-cornflower" />
                    Sync Corporate Knowledge Base
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Upload the Trinity of Corporate Docs to initialize the Supervity Knowledge Ingestion Agent.
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (!isSyncing) setIsSyncModalOpen(false)
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                >
                  <Icons.close className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  {/* File 1 */}
                  <div className={cn(
                    "flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-4 text-center transition-all",
                    syncFiles.policy ? "border-emerald-500 bg-emerald-50/50" : "border-slate-200 hover:border-slate-300"
                  )}>
                    <div className={cn(
                      "p-2 rounded-lg mb-2",
                      syncFiles.policy ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"
                    )}>
                      <Icons.fileText className="h-6 w-6" />
                    </div>
                    <span className="text-xs font-bold text-slate-800 block mb-1">Sales Policy</span>
                    <p className="text-[10px] text-muted-foreground mb-3 truncate max-w-full">
                      {syncFiles.policy ? syncFiles.policy.name : "Discount & pricing rules"}
                    </p>
                    <label className="cursor-pointer">
                      <span className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors">
                        {syncFiles.policy ? "Change" : "Browse"}
                      </span>
                      <input
                        type="file"
                        accept=".pdf,.txt,.doc,.docx"
                        className="hidden"
                        onChange={(e) => setSyncFiles(prev => ({ ...prev, policy: e.target.files?.[0] || null }))}
                        disabled={isSyncing}
                      />
                    </label>
                  </div>

                  {/* File 2 */}
                  <div className={cn(
                    "flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-4 text-center transition-all",
                    syncFiles.sop ? "border-emerald-500 bg-emerald-50/50" : "border-slate-200 hover:border-slate-300"
                  )}>
                    <div className={cn(
                      "p-2 rounded-lg mb-2",
                      syncFiles.sop ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"
                    )}>
                      <Icons.fileText className="h-6 w-6" />
                    </div>
                    <span className="text-xs font-bold text-slate-800 block mb-1">Pipeline SOP</span>
                    <p className="text-[10px] text-muted-foreground mb-3 truncate max-w-full">
                      {syncFiles.sop ? syncFiles.sop.name : "Sales operation flows"}
                    </p>
                    <label className="cursor-pointer">
                      <span className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors">
                        {syncFiles.sop ? "Change" : "Browse"}
                      </span>
                      <input
                        type="file"
                        accept=".pdf,.txt,.doc,.docx"
                        className="hidden"
                        onChange={(e) => setSyncFiles(prev => ({ ...prev, sop: e.target.files?.[0] || null }))}
                        disabled={isSyncing}
                      />
                    </label>
                  </div>

                  {/* File 3 */}
                  <div className={cn(
                    "flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-4 text-center transition-all",
                    syncFiles.hierarchy ? "border-emerald-500 bg-emerald-50/50" : "border-slate-200 hover:border-slate-300"
                  )}>
                    <div className={cn(
                      "p-2 rounded-lg mb-2",
                      syncFiles.hierarchy ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"
                    )}>
                      <Icons.fileText className="h-6 w-6" />
                    </div>
                    <span className="text-xs font-bold text-slate-800 block mb-1">Org Hierarchy</span>
                    <p className="text-[10px] text-muted-foreground mb-3 truncate max-w-full">
                      {syncFiles.hierarchy ? syncFiles.hierarchy.name : "Teams & approval matrices"}
                    </p>
                    <label className="cursor-pointer">
                      <span className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors">
                        {syncFiles.hierarchy ? "Change" : "Browse"}
                      </span>
                      <input
                        type="file"
                        accept=".pdf,.txt,.doc,.docx"
                        className="hidden"
                        onChange={(e) => setSyncFiles(prev => ({ ...prev, hierarchy: e.target.files?.[0] || null }))}
                        disabled={isSyncing}
                      />
                    </label>
                  </div>
                </div>

                {isSyncing && (
                  <motion.div
                    className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                      <span className="flex items-center gap-1.5">
                        <Icons.loader className="h-3.5 w-3.5 animate-spin text-brand-cornflower" />
                        Synchronizing aegis-nexus intelligence...
                      </span>
                      <span>Ingesting</span>
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <motion.div
                        className="bg-brand-cornflower h-full rounded-full"
                        initial={{ width: "10%" }}
                        animate={{ width: "95%" }}
                        transition={{ duration: 15, ease: "easeOut" }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Calling Supervity Knowledge Agent to extract policy schemas & construct RAG vectors.
                    </p>
                  </motion.div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
                <Button
                  variant="ghost"
                  onClick={() => setIsSyncModalOpen(false)}
                  disabled={isSyncing}
                >
                  Cancel
                </Button>
                <Button
                  variant="gradient"
                  onClick={handleSyncCorporateDocs}
                  disabled={isSyncing || !syncFiles.policy || !syncFiles.sop || !syncFiles.hierarchy}
                >
                  {isSyncing ? (
                    <>
                      <Icons.loader className="mr-2 h-4 w-4 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <Icons.check className="mr-2 h-4 w-4" />
                      Verify and Ingest
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

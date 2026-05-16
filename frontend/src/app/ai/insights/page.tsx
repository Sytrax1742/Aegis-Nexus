'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { CardWatermark } from '@/components/ui/card-watermark'
import { Icons } from '@/components/ui/icons'
import { InsightCard, type Insight } from '@/components/ai/insights/InsightCard'
import { PatternCluster, type Pattern } from '@/components/ai/insights/PatternCluster'
import { ActionCard, type ActionItem } from '@/components/ai/insights/ActionCard'

// ============================================================================
// Demo Data — Replace with your own API integration
// ============================================================================

const DEMO_INSIGHTS: Insight[] = [
  {
    id: 'demo-insight-001',
    type: 'anomaly',
    severity: 'warning',
    title: 'Sudden Spike in High-Discount Requests',
    description: 'Discount requests above 15% increased by 127% this week compared to baseline. 34 deals flagged. Potential margin erosion of ~$180k.',
    data: { baseline_high_discount_deals: 12, current_week_deals: 27, increase_percent: '127%', estimated_margin_impact: '$180k', top_region: 'EMEA' },
    suggested_action: 'Review discount approval process and create escalation policy for discounts > 20%',
    action_type: 'create_policy',
    confidence: 0.94,
    created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    is_demo: true,
  },
  {
    id: 'demo-insight-002',
    type: 'anomaly',
    severity: 'warning',
    title: 'Win Rate Decline in 30+ Day Sales Cycles',
    description: 'Deals in the sales cycle for 30+ days have a 18% win rate, down from 34% baseline. 42 deals currently affected in this cohort.',
    data: { baseline_win_rate: '34%', current_win_rate: '18%', affected_deals: 42, avg_cycle_length_days: 45, trend: 'declining' },
    suggested_action: 'Investigate pipeline bottlenecks and implement velocity monitoring policy',
    action_type: 'investigate',
    confidence: 0.91,
    created_at: new Date(Date.now() - 6 * 3600000).toISOString(),
    is_demo: true,
  },
  {
    id: 'demo-insight-003',
    type: 'recommendation',
    severity: 'info',
    title: 'Policy Opportunity: Auto-Approve Sub-$5k Deals',
    description: '156 deals under $5k were manually reviewed this quarter. Auto-approving these could reduce sales friction and accelerate deal closure by 2-3 days on average.',
    data: { deals_under_5k: 156, manual_reviews: 156, potential_time_saved_days: 468, avg_cycle_reduction: '2-3 days' },
    suggested_action: 'Create auto-approval policy for qualified deals under $5,000 ARR',
    action_type: 'create_policy',
    confidence: 0.87,
    created_at: new Date(Date.now() - 12 * 3600000).toISOString(),
    is_demo: true,
  },
  {
    id: 'demo-insight-004',
    type: 'anomaly',
    severity: 'critical',
    title: 'Duplicate Deal Entry Detected',
    description: 'Two deal records created for the same customer account (Acme Corp) within 5 minutes with overlapping timelines. Risk of double-commission and revenue recognition error.',
    data: { deal_1_id: 'DEAL-2024-5834', deal_2_id: 'DEAL-2024-5841', customer: 'Acme Corp', combined_value: '$250k', time_diff_minutes: 5 },
    suggested_action: 'Review and consolidate duplicate deal records immediately',
    action_type: 'review_duplicate',
    confidence: 0.98,
    created_at: new Date(Date.now() - 30 * 60000).toISOString(),
    is_demo: true,
  },
]

const DEMO_PATTERNS: Pattern[] = [
  { name: 'Deal Closure Acceleration in Q4', frequency: 'quarterly', confidence: 0.93, sample_size: 280, description: 'Q4 deal velocity increases 65% in final 2 weeks as teams push to close FY targets', is_demo: true },
  { name: 'EMEA Sales Cycle Elongation', frequency: 'ongoing', confidence: 0.89, sample_size: 145, description: 'EMEA region deals take 23% longer to close than North America (avg 62 vs 50 days)', is_demo: true },
  { name: 'Enterprise Tier Win Rate Premium', frequency: 'monthly', confidence: 0.91, sample_size: 620, description: 'Enterprise deals (>$100k) close at 38% win rate vs 22% for mid-market segment', is_demo: true },
  { name: 'Discount Correlation with Deal Size', frequency: 'ongoing', confidence: 0.85, sample_size: 890, description: 'Deals over $50k receive average 8.3% discount vs 3.1% for deals under $10k', is_demo: true },
]

const DEMO_ACTIONS: ActionItem[] = [
  { title: 'Create auto-approval policy for deals under $5k', priority: 'high', estimated_impact: 'Accelerate deal closure by 2-3 days', action_type: 'create_policy', action_config: { template: 'auto_approve', threshold: 5000, entity_type: 'deal' }, is_demo: true },
  { title: 'Investigate pipeline bottlenecks in 30+ day cycles', priority: 'high', estimated_impact: 'Improve 30+ day win rate from 18% to 30%+', action_type: 'investigate', action_config: { metric: 'win_rate', cohort: '30_plus_days' }, is_demo: true },
  { title: 'Consolidate duplicate Acme Corp deal records', priority: 'critical', estimated_impact: 'Prevent $250k revenue recognition error', action_type: 'review_duplicate', action_config: { deal_ids: ['DEAL-2024-5834', 'DEAL-2024-5841'] }, is_demo: true },
]

interface _InsightsResponse {
  insights: Insight[]
  patterns: Pattern[]
  actions: ActionItem[]
}

// Tab configuration
interface Tab {
  id: string
  label: string
  icon: React.ElementType
}

const tabs: Tab[] = [
  { id: 'summary', label: 'Summary', icon: Icons.activity },
  { id: 'patterns', label: 'Patterns', icon: Icons.layers },
  { id: 'actions', label: 'Actions', icon: Icons.zap },
]

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

export default function AIInsightsPage() {
  const [activeTab, setActiveTab] = useState('summary')
  const [insights, setInsights] = useState<Insight[]>([])
  const [patterns, setPatterns] = useState<Pattern[]>([])
  const [actions, setActions] = useState<ActionItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const router = useRouter()

  const fetchInsights = useCallback(async () => {
    setIsLoading(true)
    // Simulate loading — replace with real API call
    setTimeout(() => {
      setInsights(DEMO_INSIGHTS)
      setPatterns(DEMO_PATTERNS)
      setActions(DEMO_ACTIONS)
      setIsLoading(false)
    }, 300)
  }, [])

  useEffect(() => {
    fetchInsights()
  }, [fetchInsights])

  const handleAnalyze = async () => {
    setIsAnalyzing(true)
    // Simulate analysis — replace with real API call
    setTimeout(() => {
      setInsights(DEMO_INSIGHTS)
      setPatterns(DEMO_PATTERNS)
      setActions(DEMO_ACTIONS)
      setIsAnalyzing(false)
    }, 1500)
  }

  const handleInsightAction = useCallback(async (insight: Insight) => {
    // Route based on action_type
    switch (insight.action_type) {
      case 'create_policy':
        router.push('/ai/policies?tab=create-with-ai')
        break
      case 'investigate':
      case 'review_duplicate':
        router.push('/workbench')
        break
      default:
        break
    }
  }, [router])

  const handleDismissInsight = useCallback(async (id: string) => {
    // Optimistic UI update
    setInsights(prev => prev.filter(i => i.id !== id))
  }, [])

  const handleApplyAction = useCallback(async (action: ActionItem) => {
    // Route based on action type
    switch (action.action_type) {
      case 'create_policy':
        router.push('/ai/policies?tab=create-with-ai')
        break
      case 'investigate':
      case 'review_transaction':
        router.push('/workbench')
        break
      default:
        break
    }
  }, [router])

  // Stats for summary
  const criticalCount = insights.filter(i => i.severity === 'critical').length
  const warningCount = insights.filter(i => i.severity === 'warning').length
  const infoCount = insights.filter(i => i.severity === 'info').length

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h1 className="text-display-3 font-bold tracking-tight text-brand-navy lg:text-display-2">
            AI Insights
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            AI-powered analysis of your data. Discover patterns, anomalies, and optimization opportunities.
          </p>
        </div>
        <Button
          variant="gradient"
          onClick={handleAnalyze}
          disabled={isAnalyzing}
        >
          {isAnalyzing ? (
            <>
              <Icons.loader className="mr-2 h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Icons.sparkles className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Run Analysis
            </>
          )}
        </Button>
      </motion.div>

      {/* Demo Data Notice */}
      <motion.div 
        variants={itemVariants}
        className="rounded-lg border border-amber-200 bg-amber-50 p-4"
      >
        <div className="flex items-start gap-3">
          <Icons.info className="h-5 w-5 text-amber-600 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-amber-900">Demo Insights</p>
            <p className="text-sm text-amber-700 mt-1">
              Items marked with [DEMO] are sample data for demonstration purposes. 
              Connect your AI backend to enable real-time analysis of your data.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <motion.div variants={itemVariants} className="grid gap-4 sm:grid-cols-3">
        <Card className="relative overflow-hidden">
          <CardWatermark opacity={2} scale={0.8} />
          <CardContent className="relative z-10 flex items-center gap-4 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-100">
              <Icons.alertCircle className="h-6 w-6 text-red-600" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-2xl font-bold text-brand-navy">{criticalCount}</p>
              <p className="text-sm text-muted-foreground">Critical Issues</p>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <CardWatermark opacity={2} scale={0.8} />
          <CardContent className="relative z-10 flex items-center gap-4 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100">
              <Icons.alertTriangle className="h-6 w-6 text-amber-600" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-2xl font-bold text-brand-navy">{warningCount}</p>
              <p className="text-sm text-muted-foreground">Warnings</p>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <CardWatermark opacity={2} scale={0.8} />
          <CardContent className="relative z-10 flex items-center gap-4 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
              <Icons.lightbulb className="h-6 w-6 text-blue-600" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-2xl font-bold text-brand-navy">{infoCount + patterns.length}</p>
              <p className="text-sm text-muted-foreground">Recommendations</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Tab Navigation */}
      <motion.div variants={itemVariants}>
        <div className={cn(
          'inline-flex items-center gap-1 rounded-xl p-1',
          'bg-white/50 border border-border/50',
          'backdrop-blur-sm'
        )}>
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
                  isActive
                    ? 'text-white'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/50'
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
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Icons.loader className="h-8 w-8 animate-spin text-brand-cornflower" />
            </div>
          ) : (
            <>
              {activeTab === 'summary' && (
                <Card className="relative overflow-hidden">
                  <CardWatermark opacity={2} scale={1} />
                  <CardHeader className="relative z-10">
                    <CardTitle>All Insights</CardTitle>
                    <CardDescription>
                      {insights.length} insights generated from your data analysis.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="relative z-10 space-y-4">
                    {insights.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className={cn(
                          'mb-4 flex h-16 w-16 items-center justify-center rounded-2xl',
                          'bg-gradient-to-br from-brand-cornflower/20 to-brand-purple/20'
                        )}>
                          <Icons.lightbulb className="h-8 w-8 text-brand-cornflower" strokeWidth={1.5} />
                        </div>
                        <h3 className="font-display text-lg font-semibold text-brand-navy">
                          No insights yet
                        </h3>
                        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                          Run an analysis to discover patterns, anomalies, and recommendations.
                        </p>
                        <Button
                          variant="gradient"
                          className="mt-6"
                          onClick={handleAnalyze}
                          disabled={isAnalyzing}
                        >
                          <Icons.sparkles className="mr-2 h-4 w-4" strokeWidth={1.5} />
                          Generate Insights
                        </Button>
                      </div>
                    ) : (
                      insights.map((insight) => (
                        <InsightCard
                          key={insight.id}
                          insight={insight}
                          onAction={handleInsightAction}
                          onDismiss={handleDismissInsight}
                        />
                      ))
                    )}
                  </CardContent>
                </Card>
              )}

              {activeTab === 'patterns' && (
                <Card className="relative overflow-hidden">
                  <CardWatermark opacity={2} scale={1} />
                  <CardHeader className="relative z-10">
                    <CardTitle>Detected Patterns</CardTitle>
                    <CardDescription>
                      Recurring behaviors and trends identified in your data.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="relative z-10">
                    <PatternCluster patterns={patterns} />
                  </CardContent>
                </Card>
              )}

              {activeTab === 'actions' && (
                <Card className="relative overflow-hidden">
                  <CardWatermark opacity={2} scale={1} />
                  <CardHeader className="relative z-10">
                    <CardTitle>Recommended Actions</CardTitle>
                    <CardDescription>
                      AI-suggested improvements based on your insights.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="relative z-10 space-y-3">
                    {actions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className={cn(
                          'mb-4 flex h-12 w-12 items-center justify-center rounded-xl',
                          'bg-muted/50'
                        )}>
                          <Icons.zap className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          No actions recommended at this time.
                        </p>
                      </div>
                    ) : (
                      actions.map((action, idx) => (
                        <ActionCard
                          key={idx}
                          action={action}
                          onApply={handleApplyAction}
                        />
                      ))
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


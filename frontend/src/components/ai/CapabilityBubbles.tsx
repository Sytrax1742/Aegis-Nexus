'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Icons } from '@/components/ui/icons'

interface Capability {
  icon: React.ElementType
  label: string
  query: string
}

const CAPABILITIES: Capability[] = [
  { icon: Icons.activity, label: 'Pipeline Status', query: 'What is the current status of our deal pipeline? Show me a summary.' },
  { icon: Icons.shield, label: 'Check Guardrails', query: 'What are our active sales guardrails? List the discount limits and escalation triggers.' },
  { icon: Icons.brain, label: 'Agent Status', query: 'Show me the status of all Supervity agents. Which ones are active?' },
  { icon: Icons.fileText, label: 'Deal Analysis', query: 'Help me analyze a deal for compliance with our corporate policies.' },
  { icon: Icons.lightbulb, label: 'Revenue Insights', query: 'What revenue insights can you generate from our recent pipeline activity?' },
  { icon: Icons.helpCircle, label: 'How does this work?', query: 'Explain the Aegis-Nexus pipeline. How do the 7 phases work and what does each Supervity agent do?' },
]

interface CapabilityBubblesProps {
  onSelect: (query: string) => void
}

export function CapabilityBubbles({ onSelect }: CapabilityBubblesProps) {
  return (
    <div className="flex flex-wrap justify-center gap-2 p-2">
      {CAPABILITIES.map((cap, i) => {
        const Icon = cap.icon
        return (
          <motion.button
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.25, ease: 'easeOut' }}
            onClick={() => onSelect(cap.query)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-full',
              'bg-white border border-brand-cornflower/20',
              'text-sm text-brand-navy',
              'shadow-sm',
              'transition-all duration-200',
              'hover:bg-brand-cornflower/10 hover:border-brand-cornflower/40 hover:shadow-md',
              'focus:outline-none focus:ring-2 focus:ring-brand-cornflower/50'
            )}
          >
            <Icon className="h-4 w-4 text-brand-cornflower" strokeWidth={1.5} />
            <span className="text-xs sm:text-sm font-medium">{cap.label}</span>
          </motion.button>
        )
      })}
    </div>
  )
}

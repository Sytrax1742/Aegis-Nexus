'use client'

import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CardWatermark } from '@/components/ui/card-watermark'

// Exception Breakdown Data
const EXCEPTION_BREAKDOWN = [
  { name: 'Discount Limit', value: 45, fill: '#EF4444' },
  { name: 'BANT Failure', value: 35, fill: '#F59E0B' },
  { name: 'Restricted Competitor', value: 20, fill: '#6366F1' },
]

// Pipeline Velocity Data
const PIPELINE_VELOCITY = [
  { day: 'Mon', 'Zero-Touch AI': 28, 'Human Intervention': 12 },
  { day: 'Tue', 'Zero-Touch AI': 32, 'Human Intervention': 15 },
  { day: 'Wed', 'Zero-Touch AI': 26, 'Human Intervention': 18 },
  { day: 'Thu', 'Zero-Touch AI': 35, 'Human Intervention': 10 },
  { day: 'Fri', 'Zero-Touch AI': 40, 'Human Intervention': 8 },
  { day: 'Sat', 'Zero-Touch AI': 22, 'Human Intervention': 14 },
  { day: 'Sun', 'Zero-Touch AI': 18, 'Human Intervention': 9 },
]

/**
 * DashboardCharts Component
 * Renders a 2-column grid with Exception Breakdown donut chart
 * and Pipeline Velocity stacked bar chart using Recharts.
 */
export function DashboardCharts() {
  return (
    <div className='grid gap-6 lg:grid-cols-2'>
      {/* Exception Breakdown - Donut Chart */}
      <Card className='relative overflow-hidden shadow-glass'>
        <CardWatermark opacity={3} scale={0.9} />
        <CardHeader className='relative z-10'>
          <CardTitle className='text-lg font-semibold text-brand-navy'>
            Exception Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className='relative z-10 flex justify-center py-6'>
          <ResponsiveContainer width='100%' height={280}>
            <PieChart>
              <Pie
                data={EXCEPTION_BREAKDOWN}
                cx='50%'
                cy='50%'
                innerRadius={60}
                outerRadius={100}
                fill='#8884d8'
                dataKey='value'
                label={({ name, value }) => `${name} ${value}%`}
              >
                {EXCEPTION_BREAKDOWN.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `${value}%`} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Pipeline Velocity - Stacked Bar Chart */}
      <Card className='relative overflow-hidden shadow-glass'>
        <CardWatermark opacity={3} scale={0.9} />
        <CardHeader className='relative z-10'>
          <CardTitle className='text-lg font-semibold text-brand-navy'>
            Pipeline Velocity (AI vs Human)
          </CardTitle>
        </CardHeader>
        <CardContent className='relative z-10 py-6'>
          <ResponsiveContainer width='100%' height={280}>
            <BarChart
              data={PIPELINE_VELOCITY}
              margin={{ top: 20, right: 30, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray='3 3' stroke='#E8EBF2' />
              <XAxis dataKey='day' stroke='#848EAA' />
              <YAxis stroke='#848EAA' />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E8EBF2',
                  borderRadius: '0.5rem',
                }}
              />
              <Legend />
              <Bar dataKey='Zero-Touch AI' stackId='a' fill='#141A42' radius={[4, 4, 0, 0]} />
              <Bar dataKey='Human Intervention' stackId='a' fill='#8AA2DF' radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}


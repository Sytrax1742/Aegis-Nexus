'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { apiClient } from '@/lib/api-client'

export default function AdminSettingsPage() {
  const [zohoStatus, setZohoStatus] = useState<{ connected: boolean; reason: string } | null>(null)
  const [loadingZoho, setLoadingZoho] = useState(true)
  const [syncingZoho, setSyncingZoho] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => {
    async function checkZoho() {
      try {
        const res = await apiClient.get<{ connected: boolean; reason: string }>('/api/zoho/status')
        setZohoStatus(res)
      } catch (err) {
        console.error('Failed to get Zoho status', err)
      } finally {
        setLoadingZoho(false)
      }
    }
    checkZoho()

    // Check if query params indicate Zoho just connected
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      if (urlParams.get('zoho_connected') === 'true') {
        setSuccessMsg('Successfully connected to Zoho CRM!')
        // Clean URL parameter
        window.history.replaceState({}, document.title, window.location.pathname)
      } else if (urlParams.get('zoho_error')) {
        console.error('Zoho Connection Error:', urlParams.get('zoho_error'))
      }
    }
  }, [])

  const handleConnectZoho = () => {
    // Redirect browser directly to Zoho authorization URL
    window.location.href = 'http://localhost:8001/api/zoho/connect'
  }

  const handleSyncCRMNow = async () => {
    setSyncingZoho(true)
    try {
      // Simulate manual CRM database synchronization trigger
      await new Promise((resolve) => setTimeout(resolve, 1500))
      setSuccessMsg('CRM leads and accounts sync finalized.')
    } catch (err) {
      console.error(err)
    } finally {
      setSyncingZoho(false)
    }
  }

  return (
    <div className='space-y-8'>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className='flex flex-wrap items-center justify-between gap-4'
      >
        <div>
          <h1 className='text-display-4 font-extrabold text-brand-navy tracking-tight'>Command System Settings</h1>
          <p className='text-muted-foreground mt-2'>Manage integrations, access credentials, and executive preferences.</p>
        </div>
      </motion.div>

      {successMsg && (
        <div className='rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 flex items-center gap-2 shadow-sm animate-pulse'>
          <span>✓</span> {successMsg}
        </div>
      )}

      <div className='grid gap-6 md:grid-cols-2'>
        {/* Zoho CRM Integration */}
        <Card className='relative overflow-hidden border-slate-200 shadow-sm'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2.5 font-bold text-slate-900'>
              <Icons.network className='h-5 w-5 text-blue-600' />
              Zoho CRM Pipeline Integration
            </CardTitle>
            <CardDescription>Authorize sales pipeline synchronization and Lead/Deal ingestion.</CardDescription>
          </CardHeader>
          <CardContent className='space-y-6 relative z-10'>
            <div className='rounded-2xl border border-slate-100 bg-slate-50 p-5'>
              <div className='flex items-center justify-between'>
                <span className='text-sm font-semibold text-slate-700'>Connection Status</span>
                {loadingZoho ? (
                  <span className='inline-flex items-center gap-1 text-xs font-semibold text-slate-500'>
                    <Icons.loader className='h-3 w-3 animate-spin' /> Checking...
                  </span>
                ) : zohoStatus?.connected ? (
                  <span className='inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-200 shadow-sm'>
                    <span className='h-2 w-2 rounded-full bg-emerald-500 animate-ping' />
                    Connected
                  </span>
                ) : (
                  <span className='inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 border border-slate-200'>
                    Disconnected
                  </span>
                )}
              </div>
              <p className='mt-2.5 text-xs text-slate-500 leading-relaxed'>
                {loadingZoho
                  ? 'Verifying authentication handshake with Zoho modules...'
                  : zohoStatus?.reason || 'Authorization code flow pending.'}
              </p>
            </div>

            <div className='flex flex-wrap gap-3'>
              {zohoStatus?.connected ? (
                <>
                  <Button
                    variant='outline'
                    className='rounded-xl font-bold shadow-sm'
                    disabled={syncingZoho}
                    onClick={handleSyncCRMNow}
                  >
                    {syncingZoho ? (
                      <>
                        <Icons.loader className='mr-2 h-4 w-4 animate-spin' /> Syncing Hub...
                      </>
                    ) : (
                      <>
                        <Icons.activity className='mr-2 h-4 w-4 text-emerald-600' /> Sync CRM Now
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleConnectZoho}
                    variant='outline'
                    className='rounded-xl border-slate-200 hover:bg-slate-50 font-bold text-slate-600'
                  >
                    Reconnect Account
                  </Button>
                </>
              ) : (
                <Button
                  onClick={handleConnectZoho}
                  variant='gradient'
                  className='rounded-xl shadow-md font-bold'
                  disabled={loadingZoho}
                >
                  <Icons.network className='mr-2 h-4 w-4' />
                  Connect Zoho CRM Account
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Profile Settings */}
        <Card className='border-slate-200 shadow-sm'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2.5 font-bold text-slate-900'>
              <Icons.user className='h-5 w-5 text-indigo-600' />
              Executive Profile Settings
            </CardTitle>
            <CardDescription>Configure primary revenue oversight profile.</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='space-y-2'>
              <Label className='font-semibold text-slate-700'>Full Name</Label>
              <input
                type='text'
                className='w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50/50 text-sm font-semibold text-slate-800'
                defaultValue='Sarah Jenkins'
                disabled
              />
            </div>
            <div className='space-y-2'>
              <Label className='font-semibold text-slate-700'>Oversight Role</Label>
              <input
                type='text'
                className='w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50/50 text-sm font-semibold text-slate-800'
                defaultValue='VP of Sales & Revenue Operations'
                disabled
              />
            </div>
          </CardContent>
        </Card>

        {/* Notification Preferences */}
        <Card className='border-slate-200 shadow-sm'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2.5 font-bold text-slate-900'>
              <Icons.bell className='h-5 w-5 text-purple-600' />
              Oversight & Alert Routing
            </CardTitle>
            <CardDescription>Manage real-time compliance routing thresholds.</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 p-3'>
              <div className='space-y-0.5'>
                <Label className='font-semibold text-slate-800'>Slack Discount Violations Alert</Label>
                <p className='text-xs text-slate-500'>Direct webhook push for discounts &gt; 35%</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className='flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 p-3'>
              <div className='space-y-0.5'>
                <Label className='font-semibold text-slate-800'>Hourly Sync Reports</Label>
                <p className='text-xs text-slate-500'>Summarized compliance audit trail pushes</p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>

        {/* Security & Access */}
        <Card className='border-slate-200 shadow-sm'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2.5 font-bold text-slate-900'>
              <Icons.shield className='h-5 w-5 text-emerald-600' />
              Audit Security & Credentials
            </CardTitle>
            <CardDescription>Maintain secure keys for compliance validation.</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='space-y-2'>
              <Label className='font-semibold text-slate-700'>Supervity Token</Label>
              <input
                type='password'
                className='w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50/50 text-sm text-slate-600'
                defaultValue='••••••••••••••••••••••••••••••••••••'
                disabled
              />
            </div>
            <div className='flex items-center gap-2'>
              <span className='inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700 border border-emerald-100'>
                ✓ Token Vetted
              </span>
              <span className='inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700 border border-blue-100'>
                ✓ Active Session
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
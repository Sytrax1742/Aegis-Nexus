'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { apiClient } from '@/lib/api-client'

// Notification types
type NotificationType = 'info' | 'success' | 'warning' | 'error'

interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  timestamp: Date
  read: boolean
}

const typeConfig: Record<
  NotificationType,
  { icon: React.ElementType; color: string; bg: string }
> = {
  info: { icon: Icons.info, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  success: {
    icon: Icons.checkCircle,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
  },
  warning: {
    icon: Icons.alertTriangle,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
  },
  error: {
    icon: Icons.alertCircle,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
  },
}

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

// Map audit log actions to notification types
function mapActionToType(action: string, success: boolean | string): NotificationType {
  if (String(success) === 'false' || String(success) === 'False') return 'error'
  if (action.includes('error')) return 'error'
  if (action.includes('orchestrate')) return 'info'
  if (action.includes('resolve')) return 'success'
  if (action.includes('knowledge')) return 'success'
  if (String(success) === 'PROCESSING') return 'warning'
  return 'info'
}

function mapActionToTitle(action: string): string {
  if (action.includes('knowledge')) return 'Knowledge Synced'
  if (action.includes('orchestrate') && action.includes('error')) return 'Pipeline Error'
  if (action.includes('orchestrate')) return 'Pipeline Executed'
  if (action.includes('resolve')) return 'Exception Resolved'
  if (action.includes('crm')) return 'CRM Updated'
  if (action.includes('doc')) return 'Document Generated'
  if (action.includes('comms')) return 'Notification Sent'
  return action.replace('nexus.', '').replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

interface NotificationItemProps {
  notification: Notification
  onMarkAsRead: (id: string) => void
}

function NotificationItem({
  notification,
  onMarkAsRead,
}: NotificationItemProps) {
  const config = typeConfig[notification.type]
  const Icon = config.icon

  return (
    <div
      className={cn(
        'flex cursor-pointer gap-3 rounded-xl p-3',
        'transition-all duration-200 ease-out',
        'hover:scale-[1.02] active:scale-[0.98]',
        notification.read
          ? 'opacity-60 hover:opacity-100'
          : 'hover:bg-brand-cornflower/5 hover:shadow-sm'
      )}
      onClick={() => onMarkAsRead(notification.id)}
    >
      <div
        className={cn(
          'flex-shrink-0 rounded-lg p-2 transition-transform duration-200',
          config.bg,
          'group-hover:scale-110'
        )}
      >
        <Icon className={cn('h-4 w-4', config.color)} strokeWidth={1.5} />
      </div>
      <div className='min-w-0 flex-1'>
        <div className='flex items-start justify-between gap-2'>
          <p className='truncate text-sm font-medium text-foreground'>
            {notification.title}
          </p>
          {!notification.read && (
            <span className='mt-1.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-brand-cornflower' />
          )}
        </div>
        <p className='mt-0.5 line-clamp-2 text-xs text-muted-foreground'>
          {notification.message}
        </p>
        <p className='mt-1 text-[10px] text-muted-foreground/60'>
          {formatRelativeTime(notification.timestamp)}
        </p>
      </div>
    </div>
  )
}

export function NotificationCenter() {
  const [notifications, setNotifications] = React.useState<Notification[]>([])
  const [readIds, setReadIds] = React.useState<Set<string>>(new Set())

  // Fetch live notifications from the audit logs
  React.useEffect(() => {
    const fetchNotifications = async () => {
      try {
        interface AuditLogEntry {
          timestamp: string
          action: string
          status: boolean | string
        }
        const logs = await apiClient.get<AuditLogEntry[]>('/api/v1/nexus/logs')
        if (Array.isArray(logs) && logs.length > 0) {
          const mapped: Notification[] = logs.slice(0, 8).map((log, idx) => ({
            id: `live-${idx}-${log.timestamp}`,
            type: mapActionToType(log.action, log.status),
            title: mapActionToTitle(log.action),
            message: log.action.replace('nexus.', ''),
            timestamp: new Date(log.timestamp),
            read: readIds.has(`live-${idx}-${log.timestamp}`),
          }))
          setNotifications(mapped)
        }
      } catch {
        // Silently fail — no notifications is fine
      }
    }

    fetchNotifications()
    const interval = setInterval(fetchNotifications, 5000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length

  const markAsRead = (id: string) => {
    setReadIds((prev) => new Set([...prev, id]))
  }

  const markAllAsRead = () => {
    setReadIds(new Set(notifications.map((n) => n.id)))
  }

  // Apply read state
  const displayNotifications = notifications.map(n => ({
    ...n,
    read: readIds.has(n.id),
  }))

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className='relative rounded-full text-muted-foreground hover:text-foreground'
        >
          <Icons.bell className='h-5 w-5' strokeWidth={1.5} />
          {unreadCount > 0 && (
            <span
              className={cn(
                'absolute -right-0.5 -top-0.5',
                'flex h-4 min-w-4 items-center justify-center',
                'rounded-full bg-destructive px-1',
                'text-[10px] font-semibold text-white',
                'animate-badge-bounce'
              )}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-80 p-0'>
        {/* Header */}
        <div className='flex items-center justify-between border-b border-border/50 px-4 py-3'>
          <h3 className='font-display font-semibold text-foreground'>
            Notifications
          </h3>
          {unreadCount > 0 && (
            <Button
              variant='link'
              size='sm'
              onClick={markAllAsRead}
              className='h-auto p-0 text-xs text-brand-cornflower'
            >
              Mark all as read
            </Button>
          )}
        </div>

        {/* Notification list */}
        <div className='max-h-[300px] overflow-y-auto p-2'>
          {displayNotifications.length === 0 ? (
            <div className='py-8 text-center'>
              <div className='mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50'>
                <Icons.checkCircle className='h-6 w-6 text-muted-foreground' />
              </div>
              <p className='text-sm font-medium text-foreground'>
                All caught up!
              </p>
              <p className='mt-1 text-xs text-muted-foreground'>
                Pipeline activity will appear here
              </p>
            </div>
          ) : (
            <div className='space-y-1'>
              {displayNotifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={markAsRead}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {displayNotifications.length > 0 && (
          <div className='border-t border-border/50 p-2'>
            <Button
              variant='ghost'
              className='w-full text-brand-navy'
            >
              View all activity
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

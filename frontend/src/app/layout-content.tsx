'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useSidebar } from '@/components/layout/Sidebar'
import { VisualPattern } from '@/components/brand'
import { cn } from '@/lib/utils'

// Routes that should NOT show the main app shell (sidebar, header)
const AUTH_ROUTES = ['/auth/signin', '/auth/register', '/auth/error']

// Lazy load components that require context to avoid SSR hydration issues
const Sidebar = dynamic(() => import('@/components/layout/Sidebar').then(m => ({ default: m.Sidebar })), {
  ssr: false,
})
const Header = dynamic(() => import('@/components/layout/Header').then(m => ({ default: m.Header })), {
  ssr: false,
})
const MobileSidebar = dynamic(() => import('@/components/layout/MobileSidebar').then(m => ({ default: m.MobileSidebar })), {
  ssr: false,
})

// Inner layout that can access sidebar context and pathname
function LayoutInner({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  
  // Get sidebar context safely - may be undefined on SSR
  let isCollapsed = false
  try {
    const sidebar = useSidebar()
    isCollapsed = sidebar?.isCollapsed ?? false
  } catch (e) {
    // Context not available yet
  }
  
  const pathname = usePathname()

  // Check if current route is an auth route (should be full-screen)
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname?.startsWith(route))

  // Auth routes get a clean, full-screen layout
  if (isAuthRoute) {
    return (
      <div className='min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100'>
        <VisualPattern variant='subtle' />
        <main className='relative z-10 flex min-h-screen items-center justify-center p-4'>
          {children}
        </main>
      </div>
    )
  }

  // Normal app layout with sidebar and header
  return (
    <>
      {/* Ambient visual pattern */}
      <VisualPattern variant='subtle' />

      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Mobile Sidebar */}
      <MobileSidebar
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      {/* Main content area */}
      <div
        className={cn(
          'min-h-screen',
          isCollapsed ? 'md:pl-16' : 'md:pl-64',
          'transition-all duration-300 ease-out'
        )}
      >
        {/* Floating Header */}
        <Header onOpenMobileMenu={() => setMobileMenuOpen(true)} />

        {/* Main content with landmark role */}
        <main
          id='main-content'
          role='main'
          aria-label='Main content'
          className={cn(
            'flex flex-col',
            'pt-24',
            'px-4 pb-8 lg:px-8',
            'min-h-screen'
          )}
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
    </>
  )
}

export function LayoutContent({ children }: { children: React.ReactNode }) {
  // Render only the inner content - SidebarProvider is already in place via Providers
  return <LayoutInner>{children}</LayoutInner>
}

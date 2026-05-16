import './globals.css'
import { Providers } from './providers'
import { LayoutContent } from './layout-content'
import { Funnel_Display, Geologica } from 'next/font/google'
import { cn } from '@/lib/utils'

// Configure Funnel Display (Primary / Headings)
const funnel = Funnel_Display({
  subsets: ['latin'],
  variable: '--font-funnel',
  display: 'swap',
})

// Configure Geologica (Secondary / Body)
const geologica = Geologica({
  subsets: ['latin'],
  variable: '--font-geologica',
  display: 'swap',
})

export const metadata = {
  title: 'AutoPilot Command Center',
  description: 'AI Command Center — Build, govern, and monitor your AI workforce',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang='en' className='light' suppressHydrationWarning>
      <head />
      <body
        className={cn(
          'min-h-screen font-sans antialiased',
          'bg-background text-foreground',
          funnel.variable,
          geologica.variable
        )}
      >
        <Providers>
          <LayoutContent>{children}</LayoutContent>
        </Providers>
      </body>
    </html>
  )
}

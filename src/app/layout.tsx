import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Chess Tournament',
  description: 'Swiss-system chess tournament manager',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body style={{ backgroundColor: '#0c1210', color: '#e8faf2', fontFamily: 'system-ui, -apple-system, sans-serif', minHeight: '100vh' }}>
        {children}
      </body>
    </html>
  )
}

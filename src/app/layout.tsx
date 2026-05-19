import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Chess Tournament',
  description: 'Swiss-system chess tournament manager',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body style={{ backgroundColor: '#09080a', color: '#f8f0dd', fontFamily: 'system-ui, -apple-system, sans-serif', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1 }}>{children}</div>
        <footer style={{ textAlign: 'center', padding: '16px', fontSize: '13px', color: '#7a6440' }}>
          A <a href="https://chessscenes.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#d4a853', textDecoration: 'none' }}>Chess Scenes</a> project
        </footer>
      </body>
    </html>
  )
}

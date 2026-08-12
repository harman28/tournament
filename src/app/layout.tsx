import type { Metadata } from 'next'
import './globals.css'

// Without metadataBase, Next.js falls back to a hardcoded http://localhost:3000
// for resolving absolute URLs (e.g. opengraph-image's og:image tag) - not the
// deployed domain. This app runs at a different Railway URL per environment
// (staging/production, plus whatever custom domain gets added later), so it's
// derived from Railway's own RAILWAY_PUBLIC_DOMAIN env var instead of a
// hardcoded one - falls back to localhost for local dev, where that env var
// isn't set.
const siteUrl = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : 'http://localhost:3000'

export const metadata: Metadata = {
  title: 'Chess Tournament',
  description: 'Swiss-system chess tournament manager',
  metadataBase: new URL(siteUrl),
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body style={{ backgroundColor: '#09080a', color: '#f8f0dd', fontFamily: 'system-ui, -apple-system, sans-serif', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1 }}>{children}</div>
        <footer style={{ textAlign: 'center', padding: '16px', fontSize: '13px', color: '#b89b6c' }}>
          A <a href="https://chessscenes.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#d4a853', textDecoration: 'none' }}>Chess Scenes</a> project
        </footer>
      </body>
    </html>
  )
}

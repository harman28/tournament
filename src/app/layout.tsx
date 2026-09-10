import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Chess Tournament',
  description: 'Swiss-system chess tournament manager',
}

// Only counts real visits to the production site — an unconditional script
// tag here would also count every preview/local build against real analytics.
const ANALYTICS_SCRIPT = `
(function () {
  var host = window.location.hostname;
  var isProd = host === 'tournament.chessscenes.com';
  if (!isProd) return;
  var s = document.createElement('script');
  s.async = true;
  s.src = '//gc.zgo.at/count.js';
  s.setAttribute('data-goatcounter', 'https://chessscenestournament.goatcounter.com/count');
  document.head.appendChild(s);
})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ANALYTICS_SCRIPT }} />
      </head>
      <body style={{ backgroundColor: '#09080a', color: '#f8f0dd', fontFamily: 'system-ui, -apple-system, sans-serif', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1 }}>{children}</div>
        <footer style={{ textAlign: 'center', padding: '16px', fontSize: '13px', color: '#b89b6c' }}>
          A <a href="https://chessscenes.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#d4a853', textDecoration: 'none' }}>Chess Scenes</a> project
        </footer>
      </body>
    </html>
  )
}

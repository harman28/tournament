'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const BG     = '#09080a'
const CARD   = '#130f08'
const BORDER = '#74602c'
const ACCENT = '#d4a853'
const TEXT   = '#f8f0dd'

export default function AdminLoginForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    setLoading(false)
    if (!res.ok) { setError('Wrong password'); return }
    router.refresh()
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 360 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: TEXT, marginBottom: 20, textAlign: 'center' }}>Site Admin</h1>
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus
          style={{ width: '100%', backgroundColor: CARD, border: `1.5px solid ${error ? '#ef4444' : BORDER}`, borderRadius: 10, padding: '12px 14px', color: TEXT, fontSize: 15, outline: 'none', marginBottom: 12 }}
          onFocus={(e) => (e.target.style.borderColor = ACCENT)}
          onBlur={(e) => (e.target.style.borderColor = error ? '#ef4444' : BORDER)} />
        {error && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <button type="submit" disabled={loading}
          style={{ width: '100%', backgroundColor: ACCENT, color: BG, fontWeight: 800, border: 'none', borderRadius: 10, padding: '13px', fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Checking…' : 'Log in'}
        </button>
      </form>
    </div>
  )
}

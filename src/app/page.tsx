'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { recommendedRounds } from '@/lib/swiss'

const BG     = '#09080a'
const CARD   = '#130f08'
const BORDER = '#2e2610'
const ACCENT = '#d4a853'
const MUTED  = '#7a6440'
const TEXT   = '#f8f0dd'
const DIM    = '#3d3010'

type PlayerEntry = { name: string; rating: string }
type Format = 'swiss' | 'rr' | 'drr'

const FORMAT_OPTS: { value: Format; label: string; sub?: string }[] = [
  { value: 'swiss',  label: 'Swiss' },
  { value: 'rr',    label: 'Round Robin', sub: 'Single' },
  { value: 'drr',   label: 'Round Robin', sub: 'Double' },
]

export default function Home() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [format, setFormat] = useState<Format>('swiss')
  const [players, setPlayers] = useState<PlayerEntry[]>([
    { name: '', rating: '' },
    { name: '', rating: '' },
    { name: '', rating: '' },
  ])
  const [numRounds, setNumRounds] = useState(3)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const validPlayers = players.filter((p) => p.name.trim())
  const isRR = format === 'rr' || format === 'drr'

  const nameCounts = validPlayers.reduce<Record<string, number>>((acc, p) => {
    const key = p.name.trim().toLowerCase()
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
  const isDuplicate = (name: string) => name.trim() && (nameCounts[name.trim().toLowerCase()] ?? 0) > 1
  const recommended = recommendedRounds(Math.max(validPlayers.length, 2), format)

  useEffect(() => {
    setNumRounds(recommended)
  }, [recommended])

  function updatePlayer(i: number, field: keyof PlayerEntry, value: string) {
    setPlayers((ps) => {
      const next = ps.map((p, j) => (j === i ? { ...p, [field]: value } : p))
      if (field === 'name' && value.trim() && i === ps.length - 1) next.push({ name: '', rating: '' })
      return next
    })
  }

  function removePlayer(i: number) {
    if (players.length <= 2) return
    setPlayers((ps) => ps.filter((_, j) => j !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) return setError('Enter a tournament name.')
    if (validPlayers.length < 2) return setError('Add at least 2 players.')
    if (validPlayers.some((p) => isDuplicate(p.name))) return setError('Two players have the same name.')
    setLoading(true)
    try {
      const res = await fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, format, numRounds, players: validPlayers.map((p) => ({ name: p.name.trim(), rating: p.rating ? parseInt(p.rating) : null })) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push(`/t/${data.id}/admin/${data.adminToken}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: 480 }} className="fade-up">

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 16 }}>♟</div>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: TEXT, letterSpacing: '-0.5px', margin: 0 }}>Chess Tournament</h1>
          <p style={{ color: MUTED, marginTop: 8, fontSize: 15 }}>Swiss & Round Robin · Free · Shareable</p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Name */}
          <Field label="Tournament name">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Friday Night Chess"
              style={inputStyle(CARD, BORDER, TEXT, MUTED)}
              onFocus={(e) => (e.target.style.borderColor = ACCENT)}
              onBlur={(e) => (e.target.style.borderColor = BORDER)} />
          </Field>

          {/* Format */}
          <Field label="Format">
            <div style={{ display: 'flex', gap: 8 }}>
              {FORMAT_OPTS.map((f) => (
                <button key={f.value} type="button" onClick={() => setFormat(f.value)}
                  style={{
                    flex: 1, padding: '11px 8px', borderRadius: 10, border: `2px solid ${format === f.value ? ACCENT : BORDER}`,
                    backgroundColor: format === f.value ? `${ACCENT}18` : CARD,
                    color: format === f.value ? ACCENT : MUTED, cursor: 'pointer',
                    fontSize: 13, fontWeight: 700, lineHeight: 1.3,
                    transition: 'all 0.15s',
                  }}>
                  {f.label}
                  {f.sub && <span style={{ display: 'block', fontSize: 11, fontWeight: 400, opacity: 0.7 }}>{f.sub}</span>}
                </button>
              ))}
            </div>
          </Field>

          {/* Players */}
          <Field label="Players" right={validPlayers.length >= 2 ? <span style={{ color: ACCENT, fontSize: 13 }}>{validPlayers.length} added</span> : undefined}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {players.map((p, i) => {
                const dup = isDuplicate(p.name)
                const isLast = i === players.length - 1
                const defaultBorder = dup ? '#ef4444' : isLast ? DIM : BORDER
                return (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="text" value={p.name} onChange={(e) => updatePlayer(i, 'name', e.target.value)}
                    placeholder={isLast ? '+ Add player…' : `Player ${i + 1}`}
                    style={{ ...inputStyle(CARD, defaultBorder, TEXT, MUTED), flex: 1, minWidth: 0, fontStyle: isLast && !p.name ? 'italic' : 'normal' }}
                    onFocus={(e) => (e.target.style.borderColor = dup ? '#ef4444' : ACCENT)}
                    onBlur={(e) => (e.target.style.borderColor = defaultBorder)} />
                  <input type="number" value={p.rating} onChange={(e) => updatePlayer(i, 'rating', e.target.value)}
                    placeholder="Rtg"
                    style={{ ...inputStyle(CARD, DIM, TEXT, MUTED), width: 68 }}
                    onFocus={(e) => (e.target.style.borderColor = ACCENT)}
                    onBlur={(e) => (e.target.style.borderColor = DIM)} />
                  <div style={{ width: 24 }}>
                    {i < players.length - 1 && players.length > 2 && (
                      <button type="button" onClick={() => removePlayer(i)}
                        style={{ background: 'none', border: 'none', color: MUTED, fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
                    )}
                  </div>
                </div>
                )}
              )}
            </div>
          </Field>

          {/* Rounds */}
          <Field label="Rounds" right={isRR ? <span style={{ fontSize: 12, color: MUTED }}>Fixed for {format === 'drr' ? 'double ' : ''}round robin</span> : <span style={{ fontSize: 12, color: MUTED }}>recommended for {Math.max(2, validPlayers.length)} players</span>}>
            {isRR ? (
              <div style={{ backgroundColor: CARD, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '12px 16px', color: ACCENT, fontWeight: 800, fontSize: 22 }}>
                {numRounds}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <button type="button" onClick={() => setNumRounds((n) => Math.max(1, n - 1))}
                  style={{ width: 44, height: 44, borderRadius: 10, border: `1.5px solid ${BORDER}`, backgroundColor: CARD, color: TEXT, fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                <span style={{ fontSize: 28, fontWeight: 800, color: ACCENT, minWidth: 32, textAlign: 'center' }}>{numRounds}</span>
                <button type="button" onClick={() => setNumRounds((n) => Math.min(20, n + 1))}
                  style={{ width: 44, height: 44, borderRadius: 10, border: `1.5px solid ${BORDER}`, backgroundColor: CARD, color: TEXT, fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
              </div>
            )}
          </Field>

          {error && (
            <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '12px 16px', color: '#f87171', fontSize: 14, marginBottom: 20 }}>{error}</div>
          )}

          <button type="submit" disabled={loading}
            style={{ width: '100%', backgroundColor: ACCENT, color: '#09080a', fontWeight: 800, borderRadius: 14, padding: '16px', fontSize: 16, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Creating…' : 'Create Tournament →'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Field({ label, right, children }: { label: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED }}>{label}</label>
        {right}
      </div>
      {children}
    </div>
  )
}

function inputStyle(bg: string, border: string, color: string, placeholder: string): React.CSSProperties {
  return { backgroundColor: bg, border: `1.5px solid ${border}`, borderRadius: 10, padding: '12px 14px', color, fontSize: 15, outline: 'none', width: '100%', transition: 'border-color 0.15s' }
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatLabel } from '@/lib/swiss'

const BG     = '#09080a'
const CARD   = '#130f08'
const ROW    = '#1a1508'
const BORDER = '#74602c'
const ACCENT = '#d4a853'
const MUTED  = '#b89b6c'
const TEXT   = '#f8f0dd'
const DIM    = '#96803f'

type AdminPlayer = { id: string; name: string; rating: number | null; seed: number }
type AdminTournament = {
  id: string
  name: string
  format: string
  status: string
  numRounds: number
  createdAt: Date | string
  players: AdminPlayer[]
  _count: { rounds: number }
}

export default function AdminDashboard({ tournaments }: { tournaments: AdminTournament[] }) {
  const router = useRouter()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' })
    router.refresh()
  }

  async function deleteTournament(t: AdminTournament) {
    if (!window.confirm(`Delete "${t.name}"? This permanently removes the tournament, its ${t.players.length} player${t.players.length === 1 ? '' : 's'}, and all rounds/results. This cannot be undone.`))
      return
    setDeletingId(t.id)
    await fetch(`/api/admin/tournaments/${t.id}`, { method: 'DELETE' })
    setDeletingId(null)
    router.refresh()
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, padding: '32px 16px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: TEXT, margin: 0 }}>Site Admin</h1>
            <p style={{ color: MUTED, fontSize: 13, marginTop: 4 }}>{tournaments.length} tournament{tournaments.length === 1 ? '' : 's'} total</p>
          </div>
          <button onClick={logout}
            style={{ fontSize: 13, border: `1px solid ${BORDER}`, borderRadius: 9, padding: '8px 16px', backgroundColor: 'transparent', color: MUTED, cursor: 'pointer' }}>
            Log out
          </button>
        </div>

        <div style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 90px 70px 160px 90px', gap: 8, padding: '10px 16px', backgroundColor: CARD, borderBottom: `1px solid ${BORDER}` }}>
            {['Name', 'Format', 'Status', 'Players', 'Created', ''].map((h, i) => (
              <span key={i} style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED }}>{h}</span>
            ))}
          </div>

          {tournaments.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: MUTED, backgroundColor: ROW }}>No tournaments yet.</div>
          )}

          {tournaments.map((t, i) => {
            const isOpen = expanded.has(t.id)
            return (
              <div key={t.id} style={{ borderTop: i === 0 ? 'none' : `1px solid ${BORDER}` }}>
                <button onClick={() => toggle(t.id)}
                  style={{ display: 'grid', gridTemplateColumns: '1fr 140px 90px 70px 160px 90px', gap: 8, padding: '13px 16px', width: '100%', backgroundColor: ROW, border: 'none', cursor: 'pointer', textAlign: 'left', alignItems: 'center' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isOpen ? '▾' : '▸'} {t.name}
                  </span>
                  <span style={{ fontSize: 13, color: MUTED }}>{formatLabel(t.format)}</span>
                  <StatusBadge status={t.status} />
                  <span style={{ fontSize: 13, color: MUTED }}>{t.players.length}</span>
                  <span style={{ fontSize: 12, color: DIM }}>{new Date(t.createdAt).toLocaleString()}</span>
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); deleteTournament(t) }}
                    style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', cursor: deletingId === t.id ? 'not-allowed' : 'pointer', opacity: deletingId === t.id ? 0.5 : 1, justifySelf: 'start' }}>
                    {deletingId === t.id ? 'Deleting…' : 'Delete'}
                  </span>
                </button>

                {isOpen && (
                  <div style={{ padding: '12px 16px 16px 40px', backgroundColor: CARD, borderTop: `1px solid ${BORDER}` }}>
                    <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: 8 }}>
                      {t.numRounds} rounds configured · {t._count.rounds} generated · id {t.id}
                    </p>
                    {t.players.length === 0 ? (
                      <p style={{ color: MUTED, fontSize: 13 }}>No players registered.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {t.players.map((p) => (
                          <div key={p.id} style={{ display: 'flex', gap: 10, fontSize: 14, color: TEXT }}>
                            <span style={{ color: DIM, fontFamily: 'monospace', minWidth: 20 }}>{p.seed}</span>
                            <span style={{ fontWeight: 600 }}>{p.name}</span>
                            {p.rating != null && <span style={{ color: MUTED }}>{p.rating}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const color = status === 'active' ? ACCENT : status === 'complete' ? MUTED : DIM
  return <span style={{ fontSize: 12, fontWeight: 700, color, textTransform: 'capitalize' }}>{status}</span>
}

'use client'

import { useState, useEffect, useCallback, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { TournamentData, TournamentGame, TournamentPlayer, TournamentRound, StandingRow } from '@/lib/types'

const BG     = '#09080a'
const CARD   = '#130f08'
const ROW    = '#1a1508'
const BORDER = '#74602c'
const ACCENT = '#d4a853'
const AMBER  = '#f97316'
const MUTED  = '#b89b6c'
const TEXT   = '#f8f0dd'
const DIM    = '#96803f'

type Tab = 'pairings' | 'standings'

type Props = {
  tournament: TournamentData
  standings: StandingRow[]
  adminToken?: string
}

export default function TournamentView({ tournament, standings, adminToken }: Props) {
  const router = useRouter()
  const [isRefreshing, startRefresh] = useTransition()
  const isAdmin = !!adminToken
  const defaultTab: Tab = tournament.status === 'complete' ? 'standings' : 'pairings'
  const [tab, setTab] = useState<Tab>(defaultTab)
  const [modal, setModal] = useState<TournamentGame | null>(null)
  const [profilePlayerId, setProfilePlayerId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [viewRound, setViewRound] = useState(1)
  // Optimistic results: applied immediately, cleared on server refresh
  const [optimistic, setOptimistic] = useState<Record<string, string>>({})

  // Tiebreaker rounds are always appended after all main rounds by number/
  // construction - the existing round-progress header must only ever look at
  // mainRounds, or it breaks the moment a tiebreaker round exists (e.g. shows
  // "Round 8 / 7").
  const mainRounds = tournament.rounds.filter((r) => !r.isTiebreaker)
  const currentRound = mainRounds[mainRounds.length - 1]
  const roundsComplete = mainRounds.filter((r) => r.status === 'complete').length
  const currentRoundComplete = currentRound?.games.every((g) => !!g.result)
  const allDone = currentRoundComplete && mainRounds.length >= tournament.numRounds
  const pendingGames = tournament.rounds.flatMap((r) => r.games).filter((g) => g.pendingResult && !g.result)

  // Tiebreaker state. Nothing ever flips a tiebreaker Round.status to
  // "complete" the way next-round does for main rounds (they're all
  // pre-created as a full round-robin at once), so completion is always
  // derived from every game having a result, never from .status.
  const tiebreakRounds = tournament.rounds.filter((r) => r.isTiebreaker)
  const latestAttempt = tiebreakRounds.length ? Math.max(...tiebreakRounds.map((r) => r.tiebreakAttempt ?? 0)) : 0
  const currentAttemptRounds = tiebreakRounds.filter((r) => r.tiebreakAttempt === latestAttempt)
  const currentAttemptGames = currentAttemptRounds.flatMap((r) => r.games)
  const currentAttemptComplete = currentAttemptRounds.length > 0 && currentAttemptGames.every((g) => !!g.result)
  const tiedForFirst = tournament.status === 'complete' ? standings.filter((s) => s.rank === 1) : []

  useEffect(() => {
    const t = setInterval(() => router.refresh(), 30_000)
    return () => clearInterval(t)
  }, [router])

  // Clear optimistic state when server data arrives
  useEffect(() => {
    setOptimistic({})
  }, [tournament])

  // Auto-jump the Pairings tab to whichever round was created most recently -
  // including a tiebreaker round, which is why this uses tournament.rounds
  // (the full list) rather than currentRound (main rounds only, used solely
  // for the round-progress header/next-round button logic above).
  const latestRound = tournament.rounds[tournament.rounds.length - 1]
  useEffect(() => {
    if (latestRound) setViewRound(latestRound.number)
  }, [latestRound?.number])

  const copyLink = useCallback(async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/t/${tournament.id}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [tournament.id])

  const manualRefresh = useCallback(() => {
    startRefresh(() => router.refresh())
  }, [router])

  async function startTournament() {
    setActionLoading(true)
    await fetch(`/api/tournaments/${tournament.id}/start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminToken }),
    })
    router.refresh()
    setActionLoading(false)
  }

  async function nextRound() {
    setActionLoading(true)
    await fetch(`/api/tournaments/${tournament.id}/next-round`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminToken }),
    })
    router.refresh()
    setActionLoading(false)
  }

  async function startTiebreaker(manualWinnerId?: string) {
    setActionLoading(true)
    await fetch(`/api/tournaments/${tournament.id}/tiebreaker`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminToken, manualWinnerId }),
    })
    router.refresh()
    setActionLoading(false)
  }

  function submitResult(gameId: string, result: string, name: string) {
    // Close modal and apply optimistic update immediately
    setModal(null)
    setOptimistic((o) => ({ ...o, [gameId]: result }))

    const endpoint = `/api/tournaments/${tournament.id}/games/${gameId}/result`
    if (isAdmin) {
      fetch(endpoint, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ result, adminToken }) })
        .then(() => router.refresh())
    } else {
      fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ result, submittedBy: name }) })
        .then(() => router.refresh())
    }
  }

  async function approve(gameId: string, reject = false) {
    await fetch(`/api/tournaments/${tournament.id}/games/${gameId}/approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminToken, reject }),
    })
    router.refresh()
  }

  async function setFixedBoard(playerId: string, fixedBoard: number | null) {
    await fetch(`/api/tournaments/${tournament.id}/players/${playerId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminToken, fixedBoard }),
    })
    router.refresh()
  }

  // Merge optimistic results into game data
  function mergeOptimistic(games: TournamentGame[]): TournamentGame[] {
    return games.map((g) => optimistic[g.id] ? { ...g, result: optimistic[g.id] } : g)
  }

  const viewRoundData = tournament.rounds.find((r) => r.number === viewRound)
  const formatLabel = tournament.format === 'rr' ? 'Round Robin' : tournament.format === 'drr' ? 'Double Round Robin' : 'Swiss'

  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header style={{ borderBottom: `1px solid ${BORDER}`, padding: '14px 16px', background: `linear-gradient(160deg, #181008 0%, ${BG} 100%)` }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              {/* Name + status badge inline */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 20, fontWeight: 800, color: TEXT, margin: 0, letterSpacing: '-0.3px' }}>
                  ♟ {tournament.name}
                </h1>
                <StatusPill status={tournament.status} />
              </div>
              <p style={{ color: MUTED, fontSize: 12, margin: '4px 0 0' }}>
                {formatLabel} · {tournament.numRounds} rounds · {tournament.players.length} players
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button onClick={manualRefresh} disabled={isRefreshing}
                style={{ fontSize: 12, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '7px 14px', backgroundColor: 'transparent', color: isRefreshing ? ACCENT : MUTED, cursor: isRefreshing ? 'default' : 'pointer', transition: 'all 0.2s' }}>
                {isRefreshing ? '↻ Refreshing…' : '↻ Refresh'}
              </button>
              {isAdmin && (
                <button onClick={copyLink}
                  style={{ fontSize: 12, border: `1px solid ${copied ? ACCENT : BORDER}`, borderRadius: 8, padding: '7px 14px', backgroundColor: copied ? `${ACCENT}18` : 'transparent', color: copied ? ACCENT : MUTED, cursor: 'pointer', transition: 'all 0.2s' }}>
                  {copied ? '✓ Copied' : '🔗 Share'}
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Pending approvals ─────────────────────────────────────── */}
      {isAdmin && pendingGames.length > 0 && (
        <div style={{ borderBottom: `1px solid rgba(249,115,22,0.3)`, backgroundColor: 'rgba(249,115,22,0.08)', padding: '12px 16px' }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: AMBER, marginBottom: 10 }}>
              {pendingGames.length} pending approval
            </p>
            {pendingGames.map((g) => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, color: TEXT }}>
                  <span style={{ color: MUTED }}>{g.white?.name} vs {g.black?.name}: </span>
                  <strong style={{ color: ACCENT }}>{friendlyResult(g.pendingResult!, g.white?.name, g.black?.name)}</strong>
                  <span style={{ color: MUTED, fontSize: 12 }}> · {g.pendingBy}</span>
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => approve(g.id)}
                    style={{ fontSize: 12, backgroundColor: ACCENT, color: BG, fontWeight: 700, border: 'none', borderRadius: 7, padding: '5px 12px', cursor: 'pointer' }}>✓ Approve</button>
                  <button onClick={() => approve(g.id, true)}
                    style={{ fontSize: 12, border: `1px solid ${BORDER}`, color: MUTED, backgroundColor: 'transparent', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Round progress ─────────────────────────────────────────── */}
      {tournament.status !== 'setup' && currentRound && (
        <div style={{ padding: '16px 16px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <span style={{ fontSize: 26, fontWeight: 900, color: TEXT, letterSpacing: '-0.5px' }}>Round {currentRound.number}</span>
                <span style={{ fontSize: 18, fontWeight: 400, color: MUTED }}> / {tournament.numRounds}</span>
              </div>
              {isAdmin && tournament.status === 'active' && currentRoundComplete && (
                <button onClick={nextRound} disabled={actionLoading}
                  style={{ backgroundColor: ACCENT, color: BG, fontWeight: 800, border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.6 : 1 }}>
                  {actionLoading ? '…' : allDone ? '🏆 Complete' : `Round ${currentRound.number + 1} →`}
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {Array.from({ length: tournament.numRounds }, (_, i) => {
                const r = mainRounds[i]
                return (
                  <div key={i} style={{ flex: 1, height: 5, borderRadius: 3, transition: 'background-color 0.4s', backgroundColor: r?.status === 'complete' ? ACCENT : r?.number === currentRound.number ? `${ACCENT}55` : BORDER }} />
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Tiebreaker progress (independent, parallel block) ────────── */}
      {tiebreakRounds.length > 0 && (
        <div style={{ padding: '16px 16px', borderBottom: `1px solid ${BORDER}`, backgroundColor: 'rgba(212,168,83,0.06)' }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontSize: 20, fontWeight: 900, color: ACCENT, letterSpacing: '-0.3px' }}>🎯 Tiebreaker</span>
                <span style={{ fontSize: 14, fontWeight: 400, color: MUTED }}> · Attempt {latestAttempt}</span>
              </div>
              {isAdmin && !tournament.tiebreakWinnerId && currentAttemptComplete && (
                <button onClick={() => startTiebreaker()} disabled={actionLoading}
                  style={{ backgroundColor: ACCENT, color: BG, fontWeight: 800, border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.6 : 1 }}>
                  {actionLoading ? '…' : 'Still tied — Start Next Attempt →'}
                </button>
              )}
              {tournament.tiebreakWinnerId && (
                <span style={{ fontSize: 13, fontWeight: 700, color: ACCENT }}>
                  🏆 {tournament.players.find((p) => p.id === tournament.tiebreakWinnerId)?.name} wins the tiebreaker
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {currentAttemptRounds.map((r) => (
                <div key={r.id} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: r.games.every((g) => !!g.result) ? ACCENT : `${ACCENT}55` }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Setup state ────────────────────────────────────────────── */}
      {tournament.status === 'setup' && (
        <div style={{ flex: 1, padding: '32px 16px' }}>
          <div style={{ maxWidth: 480, margin: '0 auto' }} className="fade-up">
            {isAdmin ? (
              <>
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                  <div style={{ fontSize: 44, marginBottom: 12 }}>🏁</div>
                  <h2 style={{ fontSize: 22, fontWeight: 800, color: TEXT, margin: '0 0 8px' }}>Ready to start</h2>
                  <p style={{ color: MUTED, lineHeight: 1.6 }}>{tournament.players.length} players · {tournament.numRounds} rounds · {formatLabel}</p>
                </div>

                {/* Two links explanation */}
                <div style={{ backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '18px', marginBottom: 20 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 14 }}>Two links, two roles</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <span style={{ fontSize: 22 }}>🔗</span>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 700, color: ACCENT, margin: '0 0 3px' }}>Player link</p>
                        <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>Share with all players. They can view pairings, standings, and submit results for your approval.</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <span style={{ fontSize: 22 }}>🔐</span>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 700, color: AMBER, margin: '0 0 3px' }}>Admin link (this page)</p>
                        <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>Keep private. Approve results, enter results directly, and advance rounds.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <button onClick={startTournament} disabled={actionLoading}
                  style={{ width: '100%', backgroundColor: ACCENT, color: BG, fontWeight: 800, border: 'none', borderRadius: 14, padding: '16px', fontSize: 16, cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.6 : 1, marginBottom: 10 }}>
                  {actionLoading ? 'Starting…' : 'Start Tournament →'}
                </button>
                <button onClick={copyLink}
                  style={{ width: '100%', backgroundColor: 'transparent', border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 14, padding: '13px', fontSize: 14, cursor: 'pointer' }}>
                  {copied ? '✓ Player link copied!' : 'Copy player link'}
                </button>
              </>
            ) : (
              <>
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                  <div style={{ fontSize: 44, marginBottom: 12 }}>⏳</div>
                  <h2 style={{ fontSize: 22, fontWeight: 800, color: TEXT, margin: '0 0 8px' }}>Waiting for the organiser to start…</h2>
                  <p style={{ color: MUTED, lineHeight: 1.6 }}>{tournament.players.length} players · {tournament.numRounds} rounds · {formatLabel}</p>
                </div>
                {/* Show player list */}
                <div style={{ backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}` }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED }}>
                      {tournament.players.length} Players registered
                    </span>
                  </div>
                  {tournament.players.map((p, i) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: i === 0 ? 'none' : `1px solid ${BORDER}`, backgroundColor: ROW }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 12, color: DIM, fontFamily: 'monospace', minWidth: 20 }}>{i + 1}</span>
                        <span style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>{p.name}</span>
                      </div>
                      {p.rating && <span style={{ fontSize: 13, color: MUTED }}>{p.rating}</span>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────────────────── */}
      {tournament.status !== 'setup' && (
        <>
          <div style={{ borderBottom: `1px solid ${BORDER}`, padding: '0 16px' }}>
            <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex' }}>
              {(['pairings', 'standings'] as Tab[]).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  style={{ padding: '13px 20px', fontSize: 14, fontWeight: 600, border: 'none', borderBottom: `2px solid ${tab === t ? ACCENT : 'transparent'}`, backgroundColor: 'transparent', color: tab === t ? ACCENT : MUTED, cursor: 'pointer', textTransform: 'capitalize', transition: 'color 0.2s', marginBottom: -1 }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, padding: '20px 16px' }}>
            <div style={{ maxWidth: 640, margin: '0 auto' }} className="fade-up" key={tab}>
              {tab === 'pairings' && (
                <div>
                  {tournament.rounds.length > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                      <NavBtn onClick={() => setViewRound((r) => Math.max(1, r - 1))} disabled={viewRound <= 1}>←</NavBtn>
                      <span style={{ fontWeight: 700, color: TEXT, fontSize: 16 }}>
                        {viewRoundData?.isTiebreaker ? 'Tiebreaker' : `Round ${viewRound}`}
                      </span>
                      <NavBtn onClick={() => setViewRound((r) => Math.min(tournament.rounds.length, r + 1))} disabled={viewRound >= tournament.rounds.length}>→</NavBtn>
                    </div>
                  )}
                  {viewRoundData && (
                    <PairingsTable round={{ ...viewRoundData, games: mergeOptimistic(viewRoundData.games) }} isAdmin={isAdmin} onSelect={setModal} onSelectPlayer={setProfilePlayerId} />
                  )}
                </div>
              )}
              {tab === 'standings' && (
                <StandingsTable
                  standings={standings} tournament={tournament} isAdmin={isAdmin}
                  onSetFixedBoard={setFixedBoard} onSelectPlayer={setProfilePlayerId}
                  tiedForFirst={tiedForFirst.map((s) => s.player)}
                  latestAttempt={latestAttempt}
                  currentAttemptGames={currentAttemptGames}
                  currentAttemptComplete={currentAttemptComplete}
                  actionLoading={actionLoading}
                  onStartTiebreaker={startTiebreaker}
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Result modal ───────────────────────────────────────────── */}
      {modal && (
        <ResultModal
          game={modal}
          isAdmin={isAdmin}
          onClose={() => setModal(null)}
          onSubmit={(result, name) => submitResult(modal.id, result, name)}
        />
      )}

      {/* ── Player profile modal ─────────────────────────────────────── */}
      {profilePlayerId && (() => {
        const player = tournament.players.find((p) => p.id === profilePlayerId)
        const standingRow = standings.find((s) => s.player.id === profilePlayerId)
        if (!player) return null
        return (
          <PlayerProfileModal
            player={player}
            standingRow={standingRow}
            rounds={tournament.rounds}
            onClose={() => setProfilePlayerId(null)}
          />
        )
      })()}
    </div>
  )
}

// ─── Pairings table ───────────────────────────────────────────────────────────

function PairingsTable({ round, isAdmin, onSelect, onSelectPlayer }: { round: TournamentData['rounds'][0]; isAdmin: boolean; onSelect: (g: TournamentGame) => void; onSelectPlayer: (playerId: string) => void }) {
  // Sort by boardNumber so a fixed-board player's game always lands in the
  // right physical position, regardless of the order pairings were generated
  // in. Older rounds created before board numbers existed have boardNumber
  // = null on every game — those fall back to original pairing order.
  const regularGames = round.games
    .filter((g) => !g.byePlayer)
    .sort((a, b) => (a.boardNumber ?? Infinity) - (b.boardNumber ?? Infinity))
  const byeGames = round.games.filter((g) => g.byePlayer)

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 72px 1fr', gap: 8, padding: '10px 14px', backgroundColor: CARD, borderBottom: `1px solid ${BORDER}` }}>
        {['#', 'White', '', 'Black'].map((h, i) => (
          <span key={i} style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, textAlign: i === 3 ? 'right' : i === 2 ? 'center' : 'left' }}>{h}</span>
        ))}
      </div>

      {/* Regular games */}
      {regularGames.map((game, i) => {
        const isWhiteWin = game.result === '1-0'
        const isBlackWin = game.result === '0-1'
        const isDraw = game.result === '1/2-1/2'
        const hasPending = !game.result && !!game.pendingResult
        const hasResult = !!game.result
        const canAct = !hasResult || isAdmin

        return (
          <button key={game.id} onClick={() => canAct && onSelect(game)} disabled={!canAct}
            className="row-hover"
            style={{ display: 'grid', gridTemplateColumns: '32px 1fr 72px 1fr', gap: 8, padding: '13px 14px', borderTop: `1px solid ${BORDER}`, alignItems: 'center', width: '100%', background: ROW, border: 'none', borderTopColor: BORDER, borderTopWidth: 1, borderTopStyle: 'solid', cursor: canAct ? 'pointer' : 'default', textAlign: 'left' }}>

            <span style={{ fontSize: 12, color: DIM, fontFamily: 'monospace', fontWeight: 600 }}>{game.boardNumber ?? i + 1}</span>

            <span onClick={(e) => { if (game.white) { e.stopPropagation(); onSelectPlayer(game.white.id) } }}
              style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: game.white ? 'pointer' : 'default', ...resultNameStyle(isWhiteWin, isBlackWin) }}>
              {game.white?.name}
            </span>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {hasPending ? (
                <span style={{ fontSize: 11, color: AMBER, fontWeight: 700, backgroundColor: 'rgba(249,115,22,0.15)', padding: '2px 6px', borderRadius: 5 }}>•••</span>
              ) : hasResult ? (
                <span style={{ fontSize: 14, fontWeight: 800, color: isDraw ? MUTED : ACCENT, textDecoration: isAdmin ? 'underline dotted' : 'none', textDecorationColor: DIM, cursor: isAdmin ? 'pointer' : 'default' }}>
                  {isDraw ? '½–½' : game.result}
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: `1.5px dashed ${DIM}`, color: MUTED, fontSize: 16, fontWeight: 300 }}>+</span>
              )}
            </div>

            <span onClick={(e) => { if (game.black) { e.stopPropagation(); onSelectPlayer(game.black.id) } }}
              style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right', cursor: game.black ? 'pointer' : 'default', ...resultNameStyle(isBlackWin, isWhiteWin) }}>
              {game.black?.name}
            </span>
          </button>
        )
      })}

      {/* Bye rows at bottom, no board number */}
      {byeGames.map((game) => (
        <div key={game.id} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 72px 1fr', gap: 8, padding: '13px 14px', borderTop: `1px solid ${BORDER}`, alignItems: 'center', backgroundColor: CARD }}>
          <span style={{ fontSize: 12, color: DIM }}>–</span>
          <span onClick={() => game.byePlayer && onSelectPlayer(game.byePlayer.id)}
            style={{ color: MUTED, fontWeight: 600, fontSize: 15, cursor: game.byePlayer ? 'pointer' : 'default' }}>{game.byePlayer?.name}</span>
          <span style={{ textAlign: 'center', color: MUTED, fontSize: 12, fontStyle: 'italic' }}>bye</span>
          <span />
        </div>
      ))}
    </div>
  )
}

// ─── Standings table ──────────────────────────────────────────────────────────

function StandingsTable({
  standings, tournament, isAdmin, onSetFixedBoard, onSelectPlayer,
  tiedForFirst, latestAttempt, currentAttemptGames, currentAttemptComplete, actionLoading, onStartTiebreaker,
}: {
  standings: StandingRow[]; tournament: TournamentData; isAdmin: boolean
  onSetFixedBoard: (playerId: string, fixedBoard: number | null) => void
  onSelectPlayer: (playerId: string) => void
  tiedForFirst: TournamentPlayer[]
  latestAttempt: number
  currentAttemptGames: TournamentGame[]
  currentAttemptComplete: boolean
  actionLoading: boolean
  onStartTiebreaker: (manualWinnerId?: string) => void
}) {
  const showRating = tournament.players.some((p) => p.rating != null)
  const gridCols = isAdmin ? '44px 1fr 52px 52px 60px' : '44px 1fr 52px 52px'
  const hasUnresolvedTie = tournament.status === 'complete' && tiedForFirst.length > 1 && !tournament.tiebreakWinnerId
  // Narrows the originally-tied group down using the latest attempt's own
  // results - same score-only logic as lib/tiebreak.ts's resolveTiebreakAttempt,
  // duplicated here (rather than imported) because that module pulls in the
  // server-only Prisma client at module scope, which client components can't
  // bundle. Falls back to the original group whenever the attempt isn't fully
  // decided yet.
  const stillTiedGroup = currentTiebreakGroup(tiedForFirst, currentAttemptGames)

  return (
    <div>
      {hasUnresolvedTie && (
        <div style={{ marginBottom: 16, padding: '14px 16px', backgroundColor: 'rgba(212,168,83,0.08)', border: `1px solid ${ACCENT}55`, borderRadius: 12 }}>
          <p style={{ fontSize: 14, color: TEXT, margin: isAdmin ? '0 0 10px' : 0 }}>
            <strong style={{ color: ACCENT }}>Tied for 1st:</strong> {tiedForFirst.map((p) => p.name).join(', ')}
          </p>
          {isAdmin && (
            <>
              {latestAttempt === 0 && (
                <button onClick={() => onStartTiebreaker()} disabled={actionLoading}
                  style={{ backgroundColor: ACCENT, color: BG, fontWeight: 800, border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.6 : 1 }}>
                  {actionLoading ? '…' : 'Start Tiebreaker →'}
                </button>
              )}
              {latestAttempt > 0 && !currentAttemptComplete && (
                <span style={{ fontSize: 13, color: MUTED, fontStyle: 'italic' }}>Tiebreaker in progress (Attempt {latestAttempt})…</span>
              )}
              {latestAttempt > 0 && currentAttemptComplete && (
                <button onClick={() => onStartTiebreaker()} disabled={actionLoading}
                  style={{ backgroundColor: ACCENT, color: BG, fontWeight: 800, border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.6 : 1 }}>
                  {actionLoading ? '…' : 'Still tied — Start Next Attempt →'}
                </button>
              )}
              {latestAttempt >= 3 && (
                <div style={{ marginTop: 12 }}>
                  <p style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>Repeated draws? Declare a winner manually:</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {stillTiedGroup.map((p) => (
                      <button key={p.id} onClick={() => onStartTiebreaker(p.id)} disabled={actionLoading}
                        style={{ fontSize: 13, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '7px 14px', backgroundColor: 'transparent', color: TEXT, cursor: actionLoading ? 'not-allowed' : 'pointer' }}>
                        Declare {p.name} winner
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

    <div style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
      <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 8, padding: '10px 14px', backgroundColor: CARD, borderBottom: `1px solid ${BORDER}` }}>
        {(isAdmin ? ['', 'Player', 'Score', 'Buch.', 'Board'] : ['', 'Player', 'Score', 'Buch.']).map((h, i) => (
          <span key={i} style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, textAlign: i >= 2 ? 'right' : 'left' }}>{h}</span>
        ))}
      </div>

      {standings.map((row) => {
        const isWinner = tournament.status === 'complete' && (tournament.tiebreakWinnerId ? row.player.id === tournament.tiebreakWinnerId : row.rank === 1)
        const medal = tournament.status === 'complete'
          ? (tournament.tiebreakWinnerId
              ? (row.player.id === tournament.tiebreakWinnerId ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : null)
              : (row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : null))
          : null

        return (
          <div key={row.player.id}
            style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 8, padding: '13px 14px', borderTop: `1px solid ${BORDER}`, alignItems: 'center', backgroundColor: isWinner ? `${ACCENT}0f` : ROW }}>
            <span style={{ fontSize: medal ? 20 : 13, color: MUTED, fontFamily: medal ? 'inherit' : 'monospace', fontWeight: 600 }}>
              {medal ?? row.rank}
            </span>
            <div style={{ minWidth: 0 }}>
              <div onClick={() => onSelectPlayer(row.player.id)}
                style={{ fontSize: 15, fontWeight: 700, color: isWinner ? ACCENT : TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}>{row.player.name}</div>
              {showRating && row.player.rating && <div style={{ fontSize: 12, color: MUTED }}>{row.player.rating}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 20, fontWeight: 900, color: isWinner ? ACCENT : TEXT }}>{scoreStr(row.score)}</span>
            </div>
            <div style={{ textAlign: 'right', fontSize: 13, color: MUTED, fontFamily: 'monospace' }}>{scoreStr(row.buchholz)}</div>
            {isAdmin && (
              <div style={{ textAlign: 'right' }}>
                <BoardPin player={row.player} onSet={(v) => onSetFixedBoard(row.player.id, v)} />
              </div>
            )}
          </div>
        )
      })}
    </div>
    </div>
  )
}

// Score-only tally among a group, using only the given games - mirrors
// resolveTiebreakAttempt in lib/tiebreak.ts but works off TournamentGame's
// nested white/black player objects (the client-side shape) rather than raw
// ids, and is a no-op fallback (returns the original group unchanged) until
// every game in the attempt has a result.
function currentTiebreakGroup(group: TournamentPlayer[], games: TournamentGame[]): TournamentPlayer[] {
  if (games.length === 0 || !games.every((g) => !!g.result)) return group

  const scores: Record<string, number> = {}
  for (const p of group) scores[p.id] = 0

  for (const g of games) {
    if (g.byePlayer) {
      if (scores[g.byePlayer.id] !== undefined) scores[g.byePlayer.id] += 1
      continue
    }
    if (!g.white || !g.black) continue
    if (g.result === '1-0') {
      if (scores[g.white.id] !== undefined) scores[g.white.id] += 1
    } else if (g.result === '0-1') {
      if (scores[g.black.id] !== undefined) scores[g.black.id] += 1
    } else if (g.result === '1/2-1/2') {
      if (scores[g.white.id] !== undefined) scores[g.white.id] += 0.5
      if (scores[g.black.id] !== undefined) scores[g.black.id] += 0.5
    }
  }

  const maxScore = Math.max(...Object.values(scores))
  return group.filter((p) => scores[p.id] === maxScore)
}

// A pinned board number keeps a player (e.g. a streamer whose camera can't
// move) on the same physical board every round, regardless of who they're
// paired against — see assignBoardNumbers() in lib/swiss.ts.
// A plain vector icon, not an emoji: 📌 is a full-color glyph that ignores
// `color` and has odd baseline/size metrics next to a text digit, which is
// what made the pin+number pairing look misaligned and jump around between
// rows of different digit-widths. This one always matches the text color
// and lines up with the number exactly like the app's other icon buttons.
function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
      <circle cx="12" cy="9" r="5" />
      <line x1="12" y1="14" x2="12" y2="21" />
    </svg>
  )
}

function BoardPin({ player, onSet }: { player: TournamentPlayer; onSet: (v: number | null) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(player.fixedBoard != null ? String(player.fixedBoard) : '')

  function commit() {
    const trimmed = val.trim()
    onSet(trimmed ? parseInt(trimmed, 10) : null)
    setEditing(false)
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
        <input type="number" value={val} onChange={(e) => setVal(e.target.value)} autoFocus min={1}
          style={{ width: 44, backgroundColor: BG, border: `1px solid ${ACCENT}`, borderRadius: 6, padding: '3px 4px', color: TEXT, fontSize: 12, textAlign: 'center', outline: 'none' }}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          onBlur={commit} />
        {/* A pin never affects the round already in progress - only calls this
            out here, at the moment it's set, so it doesn't read as "nothing
            happened" when the current round's pairings don't change. */}
        <span style={{ fontSize: 9, color: MUTED, whiteSpace: 'nowrap', lineHeight: 1 }}>from next round</span>
      </div>
    )
  }

  return (
    <button type="button" onClick={() => setEditing(true)}
      title={player.fixedBoard ? `Fixed to board ${player.fixedBoard} - applies from next round` : "Fix this player's board number"}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: player.fixedBoard ? ACCENT : MUTED, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', padding: 0, opacity: player.fixedBoard ? 1 : 0.5 }}>
      <PinIcon filled={!!player.fixedBoard} />
      {player.fixedBoard ?? ''}
    </button>
  )
}

// ─── Player profile modal ──────────────────────────────────────────────────────

type PlayerHistoryEntry = {
  roundLabel: string
  opponentName: string | null
  color: 'White' | 'Black' | null
  resultLabel: 'Win' | 'Loss' | 'Draw' | 'Bye' | 'Pending' | '—'
  isPending: boolean
}

// Walks every round (tiebreaker rounds included, labeled distinctly) and reports
// each result from THIS player's own point of view — e.g. Black winning shows
// "Win", not the raw "0-1" a PGN-style result string would show.
function getPlayerHistory(playerId: string, rounds: TournamentRound[]): PlayerHistoryEntry[] {
  const entries: PlayerHistoryEntry[] = []
  for (const round of rounds) {
    const roundLabel = round.isTiebreaker ? 'Tiebreaker' : `Round ${round.number}`
    for (const game of round.games) {
      if (game.byePlayer?.id === playerId) {
        entries.push({ roundLabel, opponentName: null, color: null, resultLabel: 'Bye', isPending: false })
        continue
      }
      const isWhite = game.white?.id === playerId
      const isBlack = game.black?.id === playerId
      if (!isWhite && !isBlack) continue

      const opponent = isWhite ? game.black : game.white
      const color: 'White' | 'Black' = isWhite ? 'White' : 'Black'
      let resultLabel: PlayerHistoryEntry['resultLabel'] = '—'
      let isPending = false

      if (game.result) {
        if (game.result === '1/2-1/2') resultLabel = 'Draw'
        else if ((game.result === '1-0' && isWhite) || (game.result === '0-1' && isBlack)) resultLabel = 'Win'
        else resultLabel = 'Loss'
      } else if (game.pendingResult) {
        isPending = true
        resultLabel = 'Pending'
      }

      entries.push({ roundLabel, opponentName: opponent?.name ?? null, color, resultLabel, isPending })
    }
  }
  return entries
}

function PlayerProfileModal({ player, standingRow, rounds, onClose }: { player: TournamentPlayer; standingRow?: StandingRow; rounds: TournamentRound[]; onClose: () => void }) {
  const history = getPlayerHistory(player.id, rounds)

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} className="slide-up"
        style={{ backgroundColor: CARD, border: `1px solid ${BORDER}`, borderTop: `1px solid ${DIM}`, borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '8px 20px 32px', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 -20px 60px rgba(0,0,0,0.6)' }}>

        <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: BORDER, margin: '12px auto 20px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: TEXT, margin: 0 }}>{player.name}</h2>
            {player.rating != null && <p style={{ color: MUTED, fontSize: 13, margin: '2px 0 0' }}>{player.rating}</p>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: MUTED, fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {standingRow && (
          <div style={{ display: 'flex', gap: 24, margin: '16px 0 20px', padding: '14px 16px', backgroundColor: ROW, borderRadius: 12, border: `1px solid ${BORDER}` }}>
            <div>
              <div style={{ fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Rank</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: ACCENT }}>{standingRow.rank}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Score</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: TEXT }}>{scoreStr(standingRow.score)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Buch.</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: TEXT }}>{scoreStr(standingRow.buchholz)}</div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {history.length === 0 && (
            <p style={{ color: MUTED, fontSize: 14, textAlign: 'center', padding: '20px 0' }}>No rounds played yet.</p>
          )}
          {history.map((h, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: ROW, borderRadius: 10, border: `1px solid ${BORDER}` }}>
              <div>
                <div style={{ fontSize: 13, color: MUTED }}>{h.roundLabel}</div>
                <div style={{ fontSize: 15, color: TEXT, fontWeight: 600 }}>
                  {h.opponentName ? `vs ${h.opponentName}` : 'Bye'}
                  {h.color && <span style={{ color: MUTED, fontWeight: 400 }}> · {h.color}</span>}
                </div>
              </div>
              <span style={{
                fontSize: 13, fontWeight: 800, padding: '4px 10px', borderRadius: 8,
                color: h.resultLabel === 'Win' ? BG : h.isPending ? AMBER : MUTED,
                backgroundColor: h.resultLabel === 'Win' ? ACCENT : h.isPending ? 'rgba(249,115,22,0.15)' : 'transparent',
              }}>
                {h.resultLabel}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Result modal ─────────────────────────────────────────────────────────────

function ResultModal({ game, isAdmin, onClose, onSubmit }: { game: TournamentGame; isAdmin: boolean; onClose: () => void; onSubmit: (r: string, n: string) => void }) {
  const [name, setName] = useState('')
  const [shake, setShake] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  const options = [
    { value: '1-0',      label: `${game.white?.name} wins`, score: '1 – 0' },
    { value: '1/2-1/2',  label: 'Draw',                     score: '½ – ½' },
    { value: '0-1',      label: `${game.black?.name} wins`, score: '0 – 1' },
  ]

  function pick(value: string) {
    if (!isAdmin && !name.trim()) {
      setShake(true); setTimeout(() => setShake(false), 600)
      nameRef.current?.focus(); return
    }
    onSubmit(value, name)
  }

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} className="slide-up"
        style={{ backgroundColor: CARD, border: `1px solid ${BORDER}`, borderTop: `1px solid ${DIM}`, borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '8px 20px 40px', boxShadow: '0 -20px 60px rgba(0,0,0,0.6)' }}>

        <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: BORDER, margin: '12px auto 20px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: TEXT, margin: 0 }}>{game.result ? 'Update result' : 'Enter result'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: MUTED, fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
        </div>
        <p style={{ color: MUTED, fontSize: 14, marginBottom: 20 }}>
          {game.white?.name} <span style={{ color: DIM }}>vs</span> {game.black?.name}
        </p>

        {!isAdmin && (
          <div style={{ marginBottom: 16 }}>
            <input ref={nameRef} type="text" placeholder="Your name *" value={name} onChange={(e) => setName(e.target.value)}
              style={{ width: '100%', backgroundColor: BG, border: `1.5px solid ${shake ? '#ef4444' : BORDER}`, borderRadius: 12, padding: '13px 16px', color: TEXT, fontSize: 15, outline: 'none', transition: 'border-color 0.2s' }}
              onFocus={(e) => (e.target.style.borderColor = ACCENT)}
              onBlur={(e) => (e.target.style.borderColor = shake ? '#ef4444' : BORDER)} />
            <p style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>Result goes to the organiser for approval.</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {options.map((o) => {
            const isCurrent = game.result === o.value
            return (
              <button key={o.value} onClick={() => pick(o.value)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderRadius: 14, border: `2px solid ${isCurrent ? ACCENT : BORDER}`, backgroundColor: isCurrent ? `${ACCENT}18` : ROW, cursor: 'pointer', width: '100%', transition: 'all 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.backgroundColor = `${ACCENT}10` }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = isCurrent ? ACCENT : BORDER; e.currentTarget.style.backgroundColor = isCurrent ? `${ACCENT}18` : ROW }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>{o.label}</span>
                <span style={{ fontSize: 18, fontWeight: 900, color: isCurrent ? ACCENT : MUTED, fontFamily: 'monospace' }}>{o.score}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Winner and loser need to read as unmistakably different at a glance, not just
// a subtle color shift — winner bold and bright, loser visibly faded down.
function resultNameStyle(isWin: boolean, isLoss: boolean): React.CSSProperties {
  if (isWin) return { color: ACCENT, fontWeight: 800 }
  if (isLoss) return { color: MUTED, fontWeight: 500, opacity: 0.55 }
  return { color: TEXT, fontWeight: 700 }
}

function NavBtn({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ width: 38, height: 38, borderRadius: 9, border: `1px solid ${BORDER}`, backgroundColor: CARD, color: TEXT, fontSize: 18, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </button>
  )
}

function StatusPill({ status }: { status: string }) {
  if (status === 'active') return (
    <span className="pulse-live" style={{ fontSize: 11, fontWeight: 800, color: ACCENT, border: `1px solid ${ACCENT}55`, borderRadius: 20, padding: '3px 10px', letterSpacing: '0.05em', flexShrink: 0 }}>● LIVE</span>
  )
  if (status === 'complete') return (
    <span style={{ fontSize: 11, fontWeight: 800, color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 20, padding: '3px 10px', flexShrink: 0 }}>COMPLETED</span>
  )
  return (
    <span style={{ fontSize: 11, fontWeight: 800, color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 20, padding: '3px 10px', flexShrink: 0 }}>NOT STARTED</span>
  )
}

function scoreStr(s: number) {
  if (s === 0) return '0'
  return s % 1 === 0.5 ? (Math.floor(s) === 0 ? '½' : `${Math.floor(s)}½`) : String(s)
}

function friendlyResult(r: string, white?: string, black?: string) {
  if (r === '1-0') return `${white} wins`
  if (r === '0-1') return `${black} wins`
  if (r === '1/2-1/2') return 'Draw'
  return r
}

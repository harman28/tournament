'use client'

import { useState, useEffect, useCallback, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { TournamentData, TournamentGame, TournamentPlayer, StandingRow } from '@/lib/types'

const BG     = '#09080a'
const CARD   = '#130f08'
const ROW    = '#1a1508'
const BORDER = '#74602c'
const ACCENT = '#d4a853'
const AMBER  = '#f97316'
const MUTED  = '#b89b6c'
const TEXT   = '#f8f0dd'
const DIM    = '#96803f'

type Tab = 'pairings' | 'results' | 'standings'

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
  const [actionLoading, setActionLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [resultsRound, setResultsRound] = useState(1)
  // Optimistic results: applied immediately, cleared on server refresh
  const [optimistic, setOptimistic] = useState<Record<string, string>>({})
  const [addPlayerOpen, setAddPlayerOpen] = useState(false)
  const [joinedPlayer, setJoinedPlayer] = useState<{ id: string; name: string } | null>(null)
  const [showJoinForm, setShowJoinForm] = useState(false)

  const currentRound = tournament.rounds[tournament.rounds.length - 1]
  const roundsComplete = tournament.rounds.filter((r) => r.status === 'complete').length
  const currentRoundComplete = currentRound?.games.every((g) => !!g.result)
  const allDone = currentRoundComplete && tournament.rounds.length >= tournament.numRounds
  const pendingGames = tournament.rounds.flatMap((r) => r.games).filter((g) => g.pendingResult && !g.result)

  useEffect(() => {
    const t = setInterval(() => router.refresh(), 30_000)
    return () => clearInterval(t)
  }, [router])

  // Clear optimistic state when server data arrives
  useEffect(() => {
    setOptimistic({})
  }, [tournament])

  useEffect(() => {
    if (currentRound) setResultsRound(currentRound.number)
  }, [currentRound?.number])

  // Remembers who this browser joined as, so a refresh (or the 30s auto-poll)
  // doesn't re-show the join form to someone who already signed up.
  useEffect(() => {
    if (isAdmin) return
    const raw = localStorage.getItem(`joined:${tournament.id}`)
    if (!raw) return
    try {
      const saved = JSON.parse(raw) as { id: string; name: string }
      if (tournament.players.some((p) => p.id === saved.id)) setJoinedPlayer(saved)
    } catch { /* ignore malformed localStorage */ }
  }, [isAdmin, tournament.id, tournament.players])

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

  async function addPlayer(name: string, rating: number | null): Promise<string | null> {
    const res = await fetch(`/api/tournaments/${tournament.id}/players`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminToken, name, rating }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return body.error ?? 'Something went wrong'
    }
    setAddPlayerOpen(false)
    router.refresh()
    return null
  }

  // Public, unauthenticated self-signup - same endpoint as addPlayer above,
  // just without an admin token. The route allows this while status is
  // "setup" (see players/route.ts).
  async function joinTournament(name: string, rating: number | null): Promise<string | null> {
    const res = await fetch(`/api/tournaments/${tournament.id}/players`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, rating }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return body.error ?? 'Something went wrong'
    const player = { id: body.player.id as string, name: body.player.name as string }
    localStorage.setItem(`joined:${tournament.id}`, JSON.stringify(player))
    setJoinedPlayer(player)
    setShowJoinForm(false)
    router.refresh()
    return null
  }

  async function removePlayer(playerId: string) {
    await fetch(`/api/tournaments/${tournament.id}/players/${playerId}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminToken }),
    })
    router.refresh()
  }

  // Merge optimistic results into game data
  function mergeOptimistic(games: TournamentGame[]): TournamentGame[] {
    return games.map((g) => optimistic[g.id] ? { ...g, result: optimistic[g.id] } : g)
  }

  const resultsRoundData = tournament.rounds.find((r) => r.number === resultsRound)
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
                const r = tournament.rounds[i]
                return (
                  <div key={i} style={{ flex: 1, height: 5, borderRadius: 3, transition: 'background-color 0.4s', backgroundColor: r?.status === 'complete' ? ACCENT : r?.number === currentRound.number ? `${ACCENT}55` : BORDER }} />
                )
              })}
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
                        <p style={{ fontSize: 13, fontWeight: 700, color: ACCENT, margin: '0 0 3px' }}>Invite link</p>
                        <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>Share with everyone. Before you start, anyone with the link can add themselves - no account needed. Once running, it&apos;s also how they view pairings, standings, and submit results for your approval.</p>
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
                  style={{ width: '100%', backgroundColor: 'transparent', border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 14, padding: '13px', fontSize: 14, cursor: 'pointer', marginBottom: 20 }}>
                  {copied ? '✓ Invite link copied!' : 'Copy invite link'}
                </button>

                <JoinForm
                  existingNames={tournament.players.map((p) => p.name)}
                  onSubmit={addPlayer}
                  namePlaceholder="Add a player by name"
                  submitLabel="Add player"
                  submittingLabel="Adding…"
                />

                <RosterList players={tournament.players} isAdmin onRemove={removePlayer} />
              </>
            ) : (
              <>
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                  <div style={{ fontSize: 44, marginBottom: 12 }}>⏳</div>
                  <h2 style={{ fontSize: 22, fontWeight: 800, color: TEXT, margin: '0 0 8px' }}>
                    {joinedPlayer ? "You're in!" : 'Join this tournament'}
                  </h2>
                  <p style={{ color: MUTED, lineHeight: 1.6 }}>{tournament.players.length} players · {tournament.numRounds} rounds · {formatLabel}</p>
                </div>

                {joinedPlayer ? (
                  <div style={{ backgroundColor: `${ACCENT}0f`, border: `1px solid ${ACCENT}55`, borderRadius: 14, padding: '16px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontSize: 14, color: TEXT }}>Signed up as <strong style={{ color: ACCENT }}>{joinedPlayer.name}</strong>. Sit tight for the organiser to start.</span>
                    {!showJoinForm && (
                      <button onClick={() => setShowJoinForm(true)}
                        style={{ fontSize: 12, fontWeight: 700, color: MUTED, background: 'none', border: 'none', textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer', whiteSpace: 'nowrap', padding: 0 }}>
                        + add another
                      </button>
                    )}
                  </div>
                ) : null}

                {(!joinedPlayer || showJoinForm) && (
                  <JoinForm
                    existingNames={tournament.players.map((p) => p.name)}
                    onSubmit={joinTournament}
                    onCancel={joinedPlayer ? () => setShowJoinForm(false) : undefined}
                  />
                )}

                <div style={{ marginTop: 20 }}>
                  <RosterList players={tournament.players} isAdmin={false} />
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
              {(['pairings', 'results', 'standings'] as Tab[]).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  style={{ padding: '13px 20px', fontSize: 14, fontWeight: 600, border: 'none', borderBottom: `2px solid ${tab === t ? ACCENT : 'transparent'}`, backgroundColor: 'transparent', color: tab === t ? ACCENT : MUTED, cursor: 'pointer', textTransform: 'capitalize', transition: 'color 0.2s', marginBottom: -1 }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, padding: '20px 16px' }}>
            <div style={{ maxWidth: 640, margin: '0 auto' }} className="fade-up" key={tab}>
              {tab === 'pairings' && currentRound && (
                <PairingsTable round={{ ...currentRound, games: mergeOptimistic(currentRound.games) }} isAdmin={isAdmin} onSelect={setModal} />
              )}
              {tab === 'results' && (
                <div>
                  {tournament.rounds.length > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                      <NavBtn onClick={() => setResultsRound((r) => Math.max(1, r - 1))} disabled={resultsRound <= 1}>←</NavBtn>
                      <span style={{ fontWeight: 700, color: TEXT, fontSize: 16 }}>Round {resultsRound}</span>
                      <NavBtn onClick={() => setResultsRound((r) => Math.min(tournament.rounds.length, r + 1))} disabled={resultsRound >= tournament.rounds.length}>→</NavBtn>
                    </div>
                  )}
                  {resultsRoundData && (
                    <PairingsTable round={{ ...resultsRoundData, games: mergeOptimistic(resultsRoundData.games) }} isAdmin={isAdmin} onSelect={setModal} />
                  )}
                </div>
              )}
              {tab === 'standings' && (
                <div>
                  {isAdmin && tournament.format === 'swiss' && tournament.status === 'active' && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                      <button onClick={() => setAddPlayerOpen(true)}
                        style={{ fontSize: 13, fontWeight: 700, border: `1px solid ${BORDER}`, borderRadius: 9, padding: '8px 14px', backgroundColor: 'transparent', color: ACCENT, cursor: 'pointer' }}>
                        + Add late player
                      </button>
                    </div>
                  )}
                  <StandingsTable standings={standings} tournament={tournament} isAdmin={isAdmin} onSetFixedBoard={setFixedBoard} />
                </div>
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

      {/* ── Add late player modal ─────────────────────────────────── */}
      {addPlayerOpen && (
        <AddPlayerModal
          nextRoundNumber={(currentRound?.number ?? 1) + 1}
          onClose={() => setAddPlayerOpen(false)}
          onSubmit={addPlayer}
        />
      )}
    </div>
  )
}

// ─── Pairings table ───────────────────────────────────────────────────────────

function PairingsTable({ round, isAdmin, onSelect }: { round: TournamentData['rounds'][0]; isAdmin: boolean; onSelect: (g: TournamentGame) => void }) {
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

            <span style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...resultNameStyle(isWhiteWin, isBlackWin) }}>
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

            <span style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right', ...resultNameStyle(isBlackWin, isWhiteWin) }}>
              {game.black?.name}
            </span>
          </button>
        )
      })}

      {/* Bye rows at bottom, no board number */}
      {byeGames.map((game) => (
        <div key={game.id} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 72px 1fr', gap: 8, padding: '13px 14px', borderTop: `1px solid ${BORDER}`, alignItems: 'center', backgroundColor: CARD }}>
          <span style={{ fontSize: 12, color: DIM }}>–</span>
          <span style={{ color: MUTED, fontWeight: 600, fontSize: 15 }}>{game.byePlayer?.name}</span>
          <span style={{ textAlign: 'center', color: MUTED, fontSize: 12, fontStyle: 'italic' }}>bye</span>
          <span />
        </div>
      ))}
    </div>
  )
}

// ─── Standings table ──────────────────────────────────────────────────────────

function StandingsTable({ standings, tournament, isAdmin, onSetFixedBoard }: { standings: StandingRow[]; tournament: TournamentData; isAdmin: boolean; onSetFixedBoard: (playerId: string, fixedBoard: number | null) => void }) {
  const showRating = tournament.players.some((p) => p.rating != null)
  const gridCols = isAdmin ? '44px 1fr 52px 52px 60px' : '44px 1fr 52px 52px'

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
      <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 8, padding: '10px 14px', backgroundColor: CARD, borderBottom: `1px solid ${BORDER}` }}>
        {(isAdmin ? ['', 'Player', 'Score', 'Buch.', 'Board'] : ['', 'Player', 'Score', 'Buch.']).map((h, i) => (
          <span key={i} style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, textAlign: i >= 2 ? 'right' : 'left' }}>{h}</span>
        ))}
      </div>

      {standings.map((row) => {
        const isWinner = tournament.status === 'complete' && row.rank === 1
        const medal = tournament.status === 'complete'
          ? (row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : null)
          : null

        return (
          <div key={row.player.id}
            style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 8, padding: '13px 14px', borderTop: `1px solid ${BORDER}`, alignItems: 'center', backgroundColor: isWinner ? `${ACCENT}0f` : ROW }}>
            <span style={{ fontSize: medal ? 20 : 13, color: MUTED, fontFamily: medal ? 'inherit' : 'monospace', fontWeight: 600 }}>
              {medal ?? row.rank}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: isWinner ? ACCENT : TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.player.name}</div>
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
  )
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
    <div onClick={onClose} className="modal-overlay">
      <div onClick={(e) => e.stopPropagation()} className="modal-sheet slide-up"
        style={{ backgroundColor: CARD, border: `1px solid ${BORDER}`, borderTop: `1px solid ${DIM}`, padding: '8px 20px 40px', boxShadow: '0 -20px 60px rgba(0,0,0,0.6)' }}>

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

// ─── Add late player modal ──────────────────────────────────────────────────

// For a Swiss tournament, a player who shows up after round 1 or 2 doesn't
// need any special catch-up handling - buildPlayerStates() in lib/standings.ts
// already treats a player with no game history as a normal 0-score entrant
// with no opponents/color history, which is exactly what a fresh late joiner
// is. They just won't appear in the current round's pairings (already fixed)
// and get slotted in like everyone else starting next round.
function AddPlayerModal({ nextRoundNumber, onClose, onSubmit }: { nextRoundNumber: number; onClose: () => void; onSubmit: (name: string, rating: number | null) => Promise<string | null> }) {
  const [name, setName] = useState('')
  const [rating, setRating] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  async function submit() {
    if (!name.trim()) {
      setError('Name is required')
      nameRef.current?.focus()
      return
    }
    setSubmitting(true)
    setError(null)
    const ratingNum = rating.trim() ? Number(rating.trim()) : null
    const err = await onSubmit(name.trim(), ratingNum != null && !Number.isNaN(ratingNum) ? ratingNum : null)
    setSubmitting(false)
    if (err) setError(err)
  }

  return (
    <div onClick={onClose} className="modal-overlay">
      <div onClick={(e) => e.stopPropagation()} className="modal-sheet slide-up"
        style={{ backgroundColor: CARD, border: `1px solid ${BORDER}`, borderTop: `1px solid ${DIM}`, padding: '8px 20px 40px', boxShadow: '0 -20px 60px rgba(0,0,0,0.6)' }}>

        <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: BORDER, margin: '12px auto 20px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: TEXT, margin: 0 }}>Add late player</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: MUTED, fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
        </div>
        <p style={{ color: MUTED, fontSize: 14, marginBottom: 20 }}>
          Joins with 0 points and no prior games. They&apos;ll appear in pairings starting Round {nextRoundNumber}.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: error ? 8 : 0 }}>
          <input ref={nameRef} type="text" placeholder="Player name *" value={name} onChange={(e) => setName(e.target.value)}
            style={{ width: '100%', backgroundColor: BG, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '13px 16px', color: TEXT, fontSize: 15, outline: 'none' }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            onFocus={(e) => (e.target.style.borderColor = ACCENT)}
            onBlur={(e) => (e.target.style.borderColor = BORDER)} />
          <input type="number" placeholder="Rating (optional)" value={rating} onChange={(e) => setRating(e.target.value)}
            style={{ width: '100%', backgroundColor: BG, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '13px 16px', color: TEXT, fontSize: 15, outline: 'none' }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            onFocus={(e) => (e.target.style.borderColor = ACCENT)}
            onBlur={(e) => (e.target.style.borderColor = BORDER)} />
        </div>

        {error && <p style={{ color: '#ef4444', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}

        <button onClick={submit} disabled={submitting}
          style={{ width: '100%', backgroundColor: ACCENT, color: BG, fontWeight: 800, border: 'none', borderRadius: 14, padding: '15px', fontSize: 15, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1, marginTop: 16 }}>
          {submitting ? 'Adding…' : 'Add player'}
        </button>
      </div>
    </div>
  )
}

// ─── Roster list (setup state) ───────────────────────────────────────────────

function RosterList({ players, isAdmin, onRemove }: { players: TournamentPlayer[]; isAdmin: boolean; onRemove?: (id: string) => void }) {
  return (
    <div style={{ backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED }}>
          {players.length} player{players.length === 1 ? '' : 's'} registered
        </span>
      </div>
      {players.length === 0 && (
        <div style={{ padding: '16px', backgroundColor: ROW, textAlign: 'center', color: MUTED, fontSize: 13 }}>
          No one yet - share the invite link to get started.
        </div>
      )}
      {players.map((p, i) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: i === 0 ? 'none' : `1px solid ${BORDER}`, backgroundColor: ROW }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: DIM, fontFamily: 'monospace', minWidth: 20 }}>{i + 1}</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>{p.name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {p.rating && <span style={{ fontSize: 13, color: MUTED }}>{p.rating}</span>}
            {isAdmin && onRemove && (
              <button type="button" onClick={() => onRemove(p.id)} title={`Remove ${p.name}`}
                style={{ background: 'none', border: 'none', color: MUTED, fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Join form (public setup state - self-signup via the invite link) ───────

function JoinForm({ existingNames, onSubmit, onCancel, namePlaceholder = 'Your name', submitLabel = 'Join tournament', submittingLabel = 'Joining…' }: { existingNames: string[]; onSubmit: (name: string, rating: number | null) => Promise<string | null>; onCancel?: () => void; namePlaceholder?: string; submitLabel?: string; submittingLabel?: string }) {
  const [name, setName] = useState('')
  const [rating, setRating] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const lowerExisting = existingNames.map((n) => n.trim().toLowerCase())

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) { setError('Enter a name'); return }
    if (lowerExisting.includes(trimmed.toLowerCase())) { setError("That name's already taken - try adding a last initial"); return }
    setSubmitting(true)
    setError(null)
    const ratingNum = rating.trim() ? Number(rating.trim()) : null
    const err = await onSubmit(trimmed, ratingNum != null && !Number.isNaN(ratingNum) ? ratingNum : null)
    setSubmitting(false)
    if (err) setError(err)
    else { setName(''); setRating('') }
  }

  return (
    <form onSubmit={submit} style={{ backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px 18px', marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <input type="text" placeholder={namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} autoFocus
          style={{ flex: 1, minWidth: 0, backgroundColor: BG, border: `1.5px solid ${error ? '#ef4444' : BORDER}`, borderRadius: 10, padding: '12px 14px', color: TEXT, fontSize: 15, outline: 'none' }}
          onFocus={(e) => (e.target.style.borderColor = ACCENT)}
          onBlur={(e) => (e.target.style.borderColor = error ? '#ef4444' : BORDER)} />
        <input type="number" placeholder="Rtg" value={rating} onChange={(e) => setRating(e.target.value)}
          style={{ width: 68, backgroundColor: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px', color: TEXT, fontSize: 15, outline: 'none' }}
          onFocus={(e) => (e.target.style.borderColor = ACCENT)}
          onBlur={(e) => (e.target.style.borderColor = BORDER)} />
      </div>
      {error && <p style={{ color: '#ef4444', fontSize: 13, margin: '8px 0 0' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button type="submit" disabled={submitting}
          style={{ flex: 1, backgroundColor: ACCENT, color: BG, fontWeight: 800, border: 'none', borderRadius: 10, padding: '13px', fontSize: 15, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1 }}>
          {submitting ? submittingLabel : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}
            style={{ backgroundColor: 'transparent', border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 10, padding: '13px 16px', fontSize: 14, cursor: 'pointer' }}>
            Cancel
          </button>
        )}
      </div>
    </form>
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

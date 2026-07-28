/**
 * Starting / resolving a tiebreaker  (POST /api/tournaments/[id]/tiebreaker)
 *
 * Only triggers for a tie at rank 1. The tied group is always recomputed
 * server-side from the main (non-tiebreaker) rounds - a client-supplied
 * participant list is never trusted. Body: { adminToken, manualWinnerId? }.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => {
  const tx = {
    tournament: {
      findUnique: vi.fn(),
      update:     vi.fn(),
    },
    round: {
      create: vi.fn(),
    },
  }
  return {
    prisma: {
      ...tx,
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    },
  }
})

import { prisma } from '@/lib/prisma'
import { POST } from './route'

// ─── Request & fixture helpers ────────────────────────────────────────────────

const params = (id: string) => ({ params: Promise.resolve({ id }) })

function tiebreakerRequest(adminToken: string, manualWinnerId?: string) {
  return new NextRequest('http://localhost/api/tournaments/tid1/tiebreaker', {
    method: 'POST',
    body: JSON.stringify({ adminToken, manualWinnerId }),
    headers: { 'Content-Type': 'application/json' },
  })
}

const ADMIN_TOKEN   = 'correct-admin-token'
const TOURNAMENT_ID = 'tid1'

const game = (id: string, roundId: string, white: string, black: string, result: string | null) => ({
  id, roundId, whitePlayerId: white, blackPlayerId: black, byePlayerId: null, result,
})

// Alice and Bob never play each other and both win both their other games,
// so both finish at 2 - a clean 2-way tie for rank 1. Carol and Dave both
// finish at 0, tied for 3rd (deliberately NOT eligible - only rank 1 counts).
const mainRounds = [
  { id: 'r1', number: 1, status: 'complete', isTiebreaker: false, tiebreakAttempt: null, games: [
    game('g1', 'r1', 'Alice', 'Carol', '1-0'),
    game('g2', 'r1', 'Bob',   'Dave',  '1-0'),
  ] },
  { id: 'r2', number: 2, status: 'complete', isTiebreaker: false, tiebreakAttempt: null, games: [
    game('g3', 'r2', 'Alice', 'Dave',  '1-0'),
    game('g4', 'r2', 'Bob',   'Carol', '1-0'),
  ] },
]

const completeTournamentWithTie = {
  id:         TOURNAMENT_ID,
  adminToken: ADMIN_TOKEN,
  name:       'Spring Classic',
  format:     'swiss',
  numRounds:  2,
  status:     'complete',
  tiebreakWinnerId: null,
  players: [
    { id: 'Alice', seed: 1, rating: null, name: 'Alice', fixedBoard: null },
    { id: 'Bob',   seed: 2, rating: null, name: 'Bob',   fixedBoard: null },
    { id: 'Carol', seed: 3, rating: null, name: 'Carol', fixedBoard: null },
    { id: 'Dave',  seed: 4, rating: null, name: 'Dave',  fixedBoard: null },
  ],
  rounds: mainRounds,
}

function givenTournamentExists(overrides: Record<string, unknown> = {}) {
  vi.mocked(prisma.tournament.findUnique).mockResolvedValueOnce({
    ...completeTournamentWithTie,
    ...overrides,
  } as any)
}

beforeEach(() => vi.clearAllMocks())

// ─── Access control ───────────────────────────────────────────────────────────

describe('Access control', () => {
  it('returns 404 when the tournament does not exist', async () => {
    vi.mocked(prisma.tournament.findUnique).mockResolvedValueOnce(null)

    const response = await POST(tiebreakerRequest(ADMIN_TOKEN), params(TOURNAMENT_ID))

    expect(response.status).toBe(404)
  })

  it('returns 403 when the admin token is incorrect', async () => {
    givenTournamentExists()

    const response = await POST(tiebreakerRequest('wrong-token'), params(TOURNAMENT_ID))

    expect(response.status).toBe(403)
    expect(vi.mocked(prisma.round.create)).not.toHaveBeenCalled()
  })
})

// ─── State guards ─────────────────────────────────────────────────────────────

describe('State guards', () => {
  it('returns 400 when the tournament is not complete yet', async () => {
    givenTournamentExists({ status: 'active' })

    const response = await POST(tiebreakerRequest(ADMIN_TOKEN), params(TOURNAMENT_ID))
    const body     = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('Tournament is not complete yet')
  })

  it('returns 400 when the tiebreak has already been resolved', async () => {
    givenTournamentExists({ tiebreakWinnerId: 'Alice' })

    const response = await POST(tiebreakerRequest(ADMIN_TOKEN), params(TOURNAMENT_ID))
    const body     = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('Tiebreak already resolved')
  })

  it('returns 400 when there is no tie for 1st place', async () => {
    // Alice clear at 4, everyone else behind - no tie at rank 1.
    givenTournamentExists({
      rounds: [
        { id: 'r1', number: 1, status: 'complete', isTiebreaker: false, tiebreakAttempt: null, games: [
          game('g1', 'r1', 'Alice', 'Bob',   '1-0'),
          game('g2', 'r1', 'Carol', 'Dave',  '1-0'),
        ] },
        { id: 'r2', number: 2, status: 'complete', isTiebreaker: false, tiebreakAttempt: null, games: [
          game('g3', 'r2', 'Alice', 'Carol', '1-0'),
          game('g4', 'r2', 'Bob',   'Dave',  '1-0'),
        ] },
      ],
    })

    const response = await POST(tiebreakerRequest(ADMIN_TOKEN), params(TOURNAMENT_ID))
    const body     = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('No tie for 1st place')
  })

  it('still detects a tie for 1st when scores match but Buchholz differs (regression: tied means same score, not same computeStandings rank)', async () => {
    // Alice and Bob both score 2, but Alice's opponents (Carol=1, Dave=1) ended
    // up stronger than Bob's (Carol=1, Eve=0), so Alice's Buchholz (2) beats
    // Bob's (1) - computeStandings ranks them 1st/2nd, NOT a shared rank 1.
    // They're still tied for this feature's purposes.
    givenTournamentExists({
      players: [
        { id: 'Alice', seed: 1, rating: null, name: 'Alice', fixedBoard: null },
        { id: 'Bob',   seed: 2, rating: null, name: 'Bob',   fixedBoard: null },
        { id: 'Carol', seed: 3, rating: null, name: 'Carol', fixedBoard: null },
        { id: 'Dave',  seed: 4, rating: null, name: 'Dave',  fixedBoard: null },
        { id: 'Eve',   seed: 5, rating: null, name: 'Eve',   fixedBoard: null },
      ],
      rounds: [
        { id: 'r1', number: 1, status: 'complete', isTiebreaker: false, tiebreakAttempt: null, games: [
          game('g1', 'r1', 'Alice', 'Carol', '1-0'),
          game('g2', 'r1', 'Bob',   'Carol', '1-0'),
        ] },
        { id: 'r2', number: 2, status: 'complete', isTiebreaker: false, tiebreakAttempt: null, games: [
          game('g3', 'r2', 'Alice', 'Dave',  '1-0'),
          game('g4', 'r2', 'Bob',   'Eve',   '1-0'),
        ] },
        { id: 'r3', number: 3, status: 'complete', isTiebreaker: false, tiebreakAttempt: null, games: [
          game('g5', 'r3', 'Carol', 'Eve',   '1-0'),
          game('g6', 'r3', 'Dave',  'Eve',   '1-0'),
        ] },
      ],
    })
    vi.mocked(prisma.round.create).mockResolvedValueOnce({ id: 'tb1' } as any)

    const response = await POST(tiebreakerRequest(ADMIN_TOKEN), params(TOURNAMENT_ID))
    const body     = await response.json()

    expect(response.status).toBe(200)
    expect(body.started).toBe(true)
    const roundData = vi.mocked(prisma.round.create).mock.calls[0][0].data
    const games = roundData.games.create as any[]
    const participants = games.flatMap((g) => [g.whitePlayerId, g.blackPlayerId]).sort()
    expect(participants).toEqual(['Alice', 'Bob'])
  })

  it('returns 400 when a tiebreaker attempt is already in progress (incomplete)', async () => {
    givenTournamentExists({
      rounds: [
        ...mainRounds,
        { id: 'tb1', number: 3, status: 'active', isTiebreaker: true, tiebreakAttempt: 1, games: [
          game('tg1', 'tb1', 'Alice', 'Bob', null),
        ] },
      ],
    })

    const response = await POST(tiebreakerRequest(ADMIN_TOKEN), params(TOURNAMENT_ID))
    const body     = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('A tiebreaker attempt is already in progress')
  })
})

// ─── Starting a tiebreaker ─────────────────────────────────────────────────────

describe('Starting a fresh tiebreaker attempt', () => {
  it('creates a round-robin among just the tied group, attempt 1, numbered after the last main round', async () => {
    givenTournamentExists()
    vi.mocked(prisma.round.create).mockResolvedValueOnce({ id: 'tb1' } as any)

    const response = await POST(tiebreakerRequest(ADMIN_TOKEN), params(TOURNAMENT_ID))
    const body     = await response.json()

    expect(response.status).toBe(200)
    expect(body.started).toBe(true)
    expect(body.attempt).toBe(1)
    expect(body.rounds).toBe(1) // 2-player round-robin = 1 round

    expect(vi.mocked(prisma.round.create)).toHaveBeenCalledTimes(1)
    const roundData = vi.mocked(prisma.round.create).mock.calls[0][0].data
    expect(roundData.number).toBe(3) // after the 2 main rounds
    expect(roundData.isTiebreaker).toBe(true)
    expect(roundData.tiebreakAttempt).toBe(1)

    const games = roundData.games.create
    expect(games).toHaveLength(1)
    const participants = [games[0].whitePlayerId, games[0].blackPlayerId].sort()
    expect(participants).toEqual(['Alice', 'Bob'])
  })

  it('starts attempt 2 numbered after a completed but still-tied attempt 1', async () => {
    givenTournamentExists({
      rounds: [
        ...mainRounds,
        { id: 'tb1', number: 3, status: 'active', isTiebreaker: true, tiebreakAttempt: 1, games: [
          game('tg1', 'tb1', 'Alice', 'Bob', '1/2-1/2'), // drawn - still tied
        ] },
      ],
    })
    vi.mocked(prisma.round.create).mockResolvedValueOnce({ id: 'tb2' } as any)

    const response = await POST(tiebreakerRequest(ADMIN_TOKEN), params(TOURNAMENT_ID))
    const body     = await response.json()

    expect(response.status).toBe(200)
    expect(body.attempt).toBe(2)

    const roundData = vi.mocked(prisma.round.create).mock.calls[0][0].data
    expect(roundData.number).toBe(4) // after main rounds (2) + attempt 1's round (1)
    expect(roundData.tiebreakAttempt).toBe(2)
  })

  it('resolves immediately (no new round) when a completed attempt already has a decisive result', async () => {
    givenTournamentExists({
      rounds: [
        ...mainRounds,
        { id: 'tb1', number: 3, status: 'active', isTiebreaker: true, tiebreakAttempt: 1, games: [
          game('tg1', 'tb1', 'Alice', 'Bob', '1-0'), // decisive
        ] },
      ],
    })

    const response = await POST(tiebreakerRequest(ADMIN_TOKEN), params(TOURNAMENT_ID))
    const body     = await response.json()

    expect(response.status).toBe(200)
    expect(body.resolved).toBe(true)
    expect(body.winnerId).toBe('Alice')
    expect(vi.mocked(prisma.round.create)).not.toHaveBeenCalled()
    expect(vi.mocked(prisma.tournament.update)).toHaveBeenCalledWith({
      where: { id: TOURNAMENT_ID },
      data:  { tiebreakWinnerId: 'Alice' },
    })
  })
})

// ─── Manual override ──────────────────────────────────────────────────────────

describe('Manual override', () => {
  it('returns 400 when the manual winner is not part of the currently tied group', async () => {
    givenTournamentExists()

    const response = await POST(tiebreakerRequest(ADMIN_TOKEN, 'Dave'), params(TOURNAMENT_ID))
    const body     = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('That player is not part of the current tied group')
  })

  it('sets the winner directly without creating any new rounds when the winner is part of the tied group', async () => {
    givenTournamentExists()

    const response = await POST(tiebreakerRequest(ADMIN_TOKEN, 'Bob'), params(TOURNAMENT_ID))
    const body     = await response.json()

    expect(response.status).toBe(200)
    expect(body.resolved).toBe(true)
    expect(body.winnerId).toBe('Bob')
    expect(vi.mocked(prisma.round.create)).not.toHaveBeenCalled()
    expect(vi.mocked(prisma.tournament.update)).toHaveBeenCalledWith({
      where: { id: TOURNAMENT_ID },
      data:  { tiebreakWinnerId: 'Bob' },
    })
  })
})

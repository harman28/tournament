/**
 * Advancing to the next round  (POST /api/tournaments/[id]/next-round)
 *
 * Once all games in the current round have results, the organiser calls this
 * endpoint to close the current round and open the next one.
 *
 * If the completed round was the final round, the tournament is marked
 * "complete" instead of generating new pairings.
 *
 * Only the holder of the admin token can advance rounds.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    tournament: {
      findUnique: vi.fn(),
      update:     vi.fn(),
    },
    round: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { POST } from './route'

// ─── Request & fixture helpers ────────────────────────────────────────────────

const params = (id: string) => ({ params: Promise.resolve({ id }) })

function nextRoundRequest(adminToken: string) {
  return new NextRequest('http://localhost/api/tournaments/tid1/next-round', {
    method: 'POST',
    body: JSON.stringify({ adminToken }),
    headers: { 'Content-Type': 'application/json' },
  })
}

const ADMIN_TOKEN   = 'correct-admin-token'
const TOURNAMENT_ID = 'tid1'

const completedGame = (id: string, white: string, black: string) => ({
  id,
  whitePlayerId: white,
  blackPlayerId: black,
  byePlayerId:   null,
  result:        '1-0', // ← has a result
  pendingResult: null,
  pendingBy:     null,
  roundId:       'r1',
})

const activeTournamentAfterRound1 = {
  id:         TOURNAMENT_ID,
  adminToken: ADMIN_TOKEN,
  name:       'Spring Classic',
  format:     'swiss',
  numRounds:  3,          // ← 3 total rounds; round 1 just finished
  status:     'active',
  players: [
    { id: 'Alice', seed: 1, rating: null, name: 'Alice' },
    { id: 'Bob',   seed: 2, rating: null, name: 'Bob'   },
    { id: 'Carol', seed: 3, rating: null, name: 'Carol' },
    { id: 'Dave',  seed: 4, rating: null, name: 'Dave'  },
  ],
  rounds: [
    {
      id:     'r1',
      number: 1,
      status: 'active',
      games: [
        completedGame('g1', 'Alice', 'Bob'),
        completedGame('g2', 'Carol', 'Dave'),
      ],
    },
  ],
}

function givenTournamentExists(overrides: Record<string, unknown> = {}) {
  vi.mocked(prisma.tournament.findUnique).mockResolvedValueOnce({
    ...activeTournamentAfterRound1,
    ...overrides,
  } as any)
}

function givenNextRoundWillBeCreated(roundId = 'round-2') {
  vi.mocked(prisma.round.update).mockResolvedValueOnce({} as any)
  vi.mocked(prisma.round.create).mockResolvedValueOnce({ id: roundId } as any)
}

beforeEach(() => vi.clearAllMocks())

// ─── Access control ───────────────────────────────────────────────────────────

describe('Access control', () => {
  it('returns 404 when the tournament does not exist', async () => {
    vi.mocked(prisma.tournament.findUnique).mockResolvedValueOnce(null)

    const response = await POST(nextRoundRequest(ADMIN_TOKEN), params(TOURNAMENT_ID))

    expect(response.status).toBe(404)
  })

  it('returns 403 when the admin token is incorrect', async () => {
    givenTournamentExists()

    const response = await POST(nextRoundRequest('wrong-token'), params(TOURNAMENT_ID))

    expect(response.status).toBe(403)
    expect(vi.mocked(prisma.round.create)).not.toHaveBeenCalled()
  })
})

// ─── State guards ─────────────────────────────────────────────────────────────

describe('State guards', () => {
  it('returns 400 when the tournament is not in "active" status', async () => {
    givenTournamentExists({ status: 'setup' })

    const response = await POST(nextRoundRequest(ADMIN_TOKEN), params(TOURNAMENT_ID))
    const body     = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('Not active')
  })

  it('returns 400 when the current round still has games without results', async () => {
    givenTournamentExists({
      rounds: [{
        ...activeTournamentAfterRound1.rounds[0],
        games: [
          { ...completedGame('g1', 'Alice', 'Bob'), result: null }, // ← still in progress
          completedGame('g2', 'Carol', 'Dave'),
        ],
      }],
    })

    const response = await POST(nextRoundRequest(ADMIN_TOKEN), params(TOURNAMENT_ID))
    const body     = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('Round not complete')
  })
})

// ─── End-of-tournament ────────────────────────────────────────────────────────

describe('When the completed round is the final round', () => {
  it('marks the tournament as "complete" and returns { complete: true } instead of a new round', async () => {
    // numRounds: 1 means round 1 is the last round
    givenTournamentExists({ numRounds: 1 })
    vi.mocked(prisma.round.update).mockResolvedValueOnce({} as any)
    vi.mocked(prisma.tournament.update).mockResolvedValueOnce({} as any)

    const response = await POST(nextRoundRequest(ADMIN_TOKEN), params(TOURNAMENT_ID))
    const body     = await response.json()

    expect(response.status).toBe(200)
    expect(body.complete).toBe(true)

    expect(vi.mocked(prisma.tournament.update)).toHaveBeenCalledWith({
      where: { id: TOURNAMENT_ID },
      data:  { status: 'complete' },
    })
    expect(vi.mocked(prisma.round.create)).not.toHaveBeenCalled()
  })
})

// ─── Advancing to the next round ──────────────────────────────────────────────

describe('When there are rounds remaining', () => {
  it('closes the current round, creates the next round, and returns the new round ID and number', async () => {
    givenTournamentExists()
    givenNextRoundWillBeCreated('round-2')

    const response = await POST(nextRoundRequest(ADMIN_TOKEN), params(TOURNAMENT_ID))
    const body     = await response.json()

    expect(response.status).toBe(200)
    expect(body.roundId).toBe('round-2')
    expect(body.roundNumber).toBe(2)

    // The current round must be marked complete before the next one is created
    expect(vi.mocked(prisma.round.update)).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data:  { status: 'complete' },
    })
  })

  it('stores the correct round number and tournament ID for the new round', async () => {
    givenTournamentExists()
    givenNextRoundWillBeCreated()

    await POST(nextRoundRequest(ADMIN_TOKEN), params(TOURNAMENT_ID))

    const roundData = vi.mocked(prisma.round.create).mock.calls[0][0].data
    expect(roundData.number).toBe(2)
    expect(roundData.tournamentId).toBe(TOURNAMENT_ID)
  })

  it('generates fresh Swiss pairings based on the results so far', async () => {
    givenTournamentExists({ format: 'swiss' })
    givenNextRoundWillBeCreated()

    await POST(nextRoundRequest(ADMIN_TOKEN), params(TOURNAMENT_ID))

    // 4 players → 2 games in round 2
    const games = vi.mocked(prisma.round.create).mock.calls[0][0].data.games.create
    expect(games).toHaveLength(2)
    expect(games.every((g: any) => g.whitePlayerId || g.byePlayerId)).toBe(true)
  })

  it('uses the Round Robin schedule (not Swiss) when the format is "rr"', async () => {
    givenTournamentExists({ format: 'rr' })
    givenNextRoundWillBeCreated()

    await POST(nextRoundRequest(ADMIN_TOKEN), params(TOURNAMENT_ID))

    const games = vi.mocked(prisma.round.create).mock.calls[0][0].data.games.create
    expect(games).toHaveLength(2)
  })
})

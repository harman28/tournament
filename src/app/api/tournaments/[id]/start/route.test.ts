/**
 * Starting a tournament  (POST /api/tournaments/[id]/start)
 *
 * The organiser triggers this once all players have been registered.
 * It generates the first round of pairings and transitions the tournament
 * from "setup" to "active".
 *
 * Only the holder of the admin token can start the tournament.
 * Starting an already-active or complete tournament is rejected.
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
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { POST } from './route'

// ─── Request & fixture helpers ────────────────────────────────────────────────

const params = (id: string) => ({ params: Promise.resolve({ id }) })

function startRequest(adminToken: string) {
  return new NextRequest('http://localhost/api/tournaments/tid1/start', {
    method: 'POST',
    body: JSON.stringify({ adminToken }),
    headers: { 'Content-Type': 'application/json' },
  })
}

const ADMIN_TOKEN   = 'correct-admin-token'
const WRONG_TOKEN   = 'wrong-token'
const TOURNAMENT_ID = 'tid1'

const fourPlayerTournamentInSetup = {
  id:         TOURNAMENT_ID,
  adminToken: ADMIN_TOKEN,
  name:       'Spring Classic',
  format:     'swiss',
  numRounds:  3,
  status:     'setup', // ← not yet started
  players: [
    { id: 'Alice', seed: 1, rating: null, name: 'Alice' },
    { id: 'Bob',   seed: 2, rating: null, name: 'Bob'   },
    { id: 'Carol', seed: 3, rating: null, name: 'Carol' },
    { id: 'Dave',  seed: 4, rating: null, name: 'Dave'  },
  ],
  rounds: [],
}

function givenTournamentExists(overrides = {}) {
  vi.mocked(prisma.tournament.findUnique).mockResolvedValueOnce({
    ...fourPlayerTournamentInSetup,
    ...overrides,
  } as any)
}

function givenRoundWillBeCreated(roundId = 'round-1') {
  vi.mocked(prisma.round.create).mockResolvedValueOnce({ id: roundId } as any)
  vi.mocked(prisma.tournament.update).mockResolvedValueOnce({} as any)
}

beforeEach(() => vi.clearAllMocks())

// ─── Access control ───────────────────────────────────────────────────────────

describe('Access control', () => {
  it('returns 404 when the tournament ID does not exist', async () => {
    vi.mocked(prisma.tournament.findUnique).mockResolvedValueOnce(null)

    const response = await POST(startRequest(ADMIN_TOKEN), params(TOURNAMENT_ID))

    expect(response.status).toBe(404)
  })

  it('returns 403 when the admin token is incorrect', async () => {
    givenTournamentExists()

    const response = await POST(startRequest(WRONG_TOKEN), params(TOURNAMENT_ID))

    expect(response.status).toBe(403)
    expect(vi.mocked(prisma.round.create)).not.toHaveBeenCalled()
  })
})

// ─── State guards ─────────────────────────────────────────────────────────────

describe('State guards', () => {
  it('returns 400 when the tournament has already been started', async () => {
    givenTournamentExists({ status: 'active' })

    const response = await POST(startRequest(ADMIN_TOKEN), params(TOURNAMENT_ID))
    const body     = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('Already started')
  })
})

// ─── Successful start ─────────────────────────────────────────────────────────

describe('Successful start', () => {
  it('creates round 1, transitions the tournament to "active", and returns the new round ID', async () => {
    givenTournamentExists()
    givenRoundWillBeCreated('round-1')

    const response = await POST(startRequest(ADMIN_TOKEN), params(TOURNAMENT_ID))
    const body     = await response.json()

    expect(response.status).toBe(200)
    expect(body.roundId).toBe('round-1')

    expect(vi.mocked(prisma.tournament.update)).toHaveBeenCalledWith({
      where: { id: TOURNAMENT_ID },
      data:  { status: 'active' },
    })
  })

  it('stores the correct round number (1) and tournament ID in the database', async () => {
    givenTournamentExists()
    givenRoundWillBeCreated()

    await POST(startRequest(ADMIN_TOKEN), params(TOURNAMENT_ID))

    const roundData = vi.mocked(prisma.round.create).mock.calls[0][0].data
    expect(roundData.number).toBe(1)
    expect(roundData.tournamentId).toBe(TOURNAMENT_ID)
  })

  it('generates 2 games for a 4-player Swiss tournament (no byes needed)', async () => {
    givenTournamentExists({ format: 'swiss' })
    givenRoundWillBeCreated()

    await POST(startRequest(ADMIN_TOKEN), params(TOURNAMENT_ID))

    const games = vi.mocked(prisma.round.create).mock.calls[0][0].data.games.create
    const realGames = games.filter((g: any) => g.whitePlayerId)
    const byes      = games.filter((g: any) => g.byePlayerId)

    expect(realGames).toHaveLength(2)
    expect(byes).toHaveLength(0)
  })

  it('generates Round Robin pairings (not Swiss) when the format is "rr"', async () => {
    givenTournamentExists({ format: 'rr' })
    givenRoundWillBeCreated()

    await POST(startRequest(ADMIN_TOKEN), params(TOURNAMENT_ID))

    // 4 players in a round robin → 2 games in round 1, no byes
    const games = vi.mocked(prisma.round.create).mock.calls[0][0].data.games.create
    expect(games).toHaveLength(2)
    expect(games.every((g: any) => g.whitePlayerId)).toBe(true)
  })

  it('generates Double Round Robin pairings when the format is "drr"', async () => {
    givenTournamentExists({ format: 'drr' })
    givenRoundWillBeCreated()

    await POST(startRequest(ADMIN_TOKEN), params(TOURNAMENT_ID))

    const games = vi.mocked(prisma.round.create).mock.calls[0][0].data.games.create
    expect(games).toHaveLength(2)
  })
})

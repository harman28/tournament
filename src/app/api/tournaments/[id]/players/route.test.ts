/**
 * Adding a player (POST /api/tournaments/[id]/players)
 *
 * Two different callers hit this same endpoint, distinguished by tournament
 * status:
 *   - "setup"  - self-signup via the invite link. No admin token needed -
 *                anyone with the link (including the admin) can add a
 *                player. Works for every format, since no round-1 schedule
 *                has been generated yet.
 *   - "active" - a late joiner added by the organiser mid-tournament (e.g.
 *                someone who shows up after round 1 or 2). Admin token
 *                required. Swiss only - Round Robin's schedule is fixed by
 *                player count at round 1, so it can't accept new entrants
 *                once running.
 *   - "complete" - always rejected.
 *
 * A newly added player has no game history, so the existing pairing
 * algorithm (buildPlayerStates/generatePairings) already treats them as a
 * normal 0-score entrant with no color history or prior opponents once the
 * next round is generated - no pairing-logic changes needed here, just
 * player creation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    tournament: { findUnique: vi.fn() },
    player:     { create: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { POST } from './route'

// ─── Request & fixture helpers ────────────────────────────────────────────────

const routeParams = { params: Promise.resolve({ id: 'tid1' }) }

function addPlayerRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/tournaments/tid1/players', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const ADMIN_TOKEN = 'correct-admin-token'

const activeSwissTournament = {
  id:         'tid1',
  adminToken: ADMIN_TOKEN,
  format:     'swiss',
  status:     'active',
  players: [
    { id: 'p1', seed: 1, name: 'Alice' },
    { id: 'p2', seed: 2, name: 'Bob' },
    { id: 'p3', seed: 3, name: 'Carol' },
  ],
}

function givenTournamentExists(overrides: Record<string, unknown> = {}) {
  vi.mocked(prisma.tournament.findUnique).mockResolvedValueOnce({
    ...activeSwissTournament,
    ...overrides,
  } as any)
}

beforeEach(() => vi.clearAllMocks())

// ─── Access control ───────────────────────────────────────────────────────────

describe('Access control', () => {
  it('returns 404 when the tournament does not exist', async () => {
    vi.mocked(prisma.tournament.findUnique).mockResolvedValueOnce(null)

    const response = await POST(addPlayerRequest({ adminToken: ADMIN_TOKEN, name: 'Dave' }), routeParams)

    expect(response.status).toBe(404)
  })

  it('returns 403 when the admin token is incorrect', async () => {
    givenTournamentExists()

    const response = await POST(addPlayerRequest({ adminToken: 'wrong-token', name: 'Dave' }), routeParams)

    expect(response.status).toBe(403)
    expect(vi.mocked(prisma.player.create)).not.toHaveBeenCalled()
  })
})

// ─── State guards ─────────────────────────────────────────────────────────────

describe('State guards', () => {
  it('rejects Round Robin tournaments', async () => {
    givenTournamentExists({ format: 'rr' })

    const response = await POST(addPlayerRequest({ adminToken: ADMIN_TOKEN, name: 'Dave' }), routeParams)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatch(/Swiss/)
    expect(vi.mocked(prisma.player.create)).not.toHaveBeenCalled()
  })

  it('rejects Double Round Robin tournaments', async () => {
    givenTournamentExists({ format: 'drr' })

    const response = await POST(addPlayerRequest({ adminToken: ADMIN_TOKEN, name: 'Dave' }), routeParams)

    expect(response.status).toBe(400)
    expect(vi.mocked(prisma.player.create)).not.toHaveBeenCalled()
  })

  it('rejects when the tournament has already finished', async () => {
    givenTournamentExists({ status: 'complete' })

    const response = await POST(addPlayerRequest({ adminToken: ADMIN_TOKEN, name: 'Dave' }), routeParams)

    expect(response.status).toBe(400)
    expect(vi.mocked(prisma.player.create)).not.toHaveBeenCalled()
  })
})

// ─── Self-signup during setup ───────────────────────────────────────────────

describe('Self-signup during setup', () => {
  it('allows joining with no admin token at all', async () => {
    givenTournamentExists({ status: 'setup' })
    vi.mocked(prisma.player.create).mockResolvedValueOnce({} as any)

    const response = await POST(addPlayerRequest({ name: 'Dave' }), routeParams)

    expect(response.status).toBe(201)
    expect(vi.mocked(prisma.player.create)).toHaveBeenCalledWith({
      data: { tournamentId: 'tid1', name: 'Dave', rating: null, seed: 4 },
    })
  })

  it('ignores an incorrect/missing admin token - anyone with the link can join pre-start', async () => {
    givenTournamentExists({ status: 'setup' })
    vi.mocked(prisma.player.create).mockResolvedValueOnce({} as any)

    const response = await POST(addPlayerRequest({ adminToken: 'wrong-token', name: 'Dave' }), routeParams)

    expect(response.status).toBe(201)
  })

  it('allows self-signup for Round Robin and Double Round Robin - no schedule exists yet pre-start', async () => {
    for (const format of ['rr', 'drr']) {
      vi.clearAllMocks()
      givenTournamentExists({ status: 'setup', format })
      vi.mocked(prisma.player.create).mockResolvedValueOnce({} as any)

      const response = await POST(addPlayerRequest({ name: 'Dave' }), routeParams)

      expect(response.status).toBe(201)
    }
  })
})

// ─── Validation ───────────────────────────────────────────────────────────────

describe('Validation', () => {
  it('rejects an empty name', async () => {
    givenTournamentExists()

    const response = await POST(addPlayerRequest({ adminToken: ADMIN_TOKEN, name: '   ' }), routeParams)

    expect(response.status).toBe(400)
    expect(vi.mocked(prisma.player.create)).not.toHaveBeenCalled()
  })

  it('rejects a missing name', async () => {
    givenTournamentExists()

    const response = await POST(addPlayerRequest({ adminToken: ADMIN_TOKEN }), routeParams)

    expect(response.status).toBe(400)
    expect(vi.mocked(prisma.player.create)).not.toHaveBeenCalled()
  })

  it('rejects a non-numeric rating', async () => {
    givenTournamentExists()

    const response = await POST(addPlayerRequest({ adminToken: ADMIN_TOKEN, name: 'Dave', rating: 'high' }), routeParams)

    expect(response.status).toBe(400)
    expect(vi.mocked(prisma.player.create)).not.toHaveBeenCalled()
  })
})

// ─── Adding the player ─────────────────────────────────────────────────────────

describe('Adding the player', () => {
  it('creates the player with the next available seed and returns 201', async () => {
    givenTournamentExists()
    vi.mocked(prisma.player.create).mockResolvedValueOnce({ id: 'p4', name: 'Dave', seed: 4 } as any)

    const response = await POST(addPlayerRequest({ adminToken: ADMIN_TOKEN, name: 'Dave' }), routeParams)
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.player).toEqual({ id: 'p4', name: 'Dave', seed: 4 })
    expect(vi.mocked(prisma.player.create)).toHaveBeenCalledWith({
      data: { tournamentId: 'tid1', name: 'Dave', rating: null, seed: 4 },
    })
  })

  it('trims the name and defaults rating to null when omitted', async () => {
    givenTournamentExists()
    vi.mocked(prisma.player.create).mockResolvedValueOnce({} as any)

    await POST(addPlayerRequest({ adminToken: ADMIN_TOKEN, name: '  Dave  ' }), routeParams)

    expect(vi.mocked(prisma.player.create)).toHaveBeenCalledWith({
      data: { tournamentId: 'tid1', name: 'Dave', rating: null, seed: 4 },
    })
  })

  it('stores a numeric rating when provided', async () => {
    givenTournamentExists()
    vi.mocked(prisma.player.create).mockResolvedValueOnce({} as any)

    await POST(addPlayerRequest({ adminToken: ADMIN_TOKEN, name: 'Dave', rating: 1500 }), routeParams)

    expect(vi.mocked(prisma.player.create)).toHaveBeenCalledWith({
      data: { tournamentId: 'tid1', name: 'Dave', rating: 1500, seed: 4 },
    })
  })

  it('computes the next seed from the max existing seed, not the player count', async () => {
    // Simulates a roster with a gap (e.g. a prior late-join already happened)
    givenTournamentExists({ players: [{ id: 'p1', seed: 1 }, { id: 'p2', seed: 5 }] })
    vi.mocked(prisma.player.create).mockResolvedValueOnce({} as any)

    await POST(addPlayerRequest({ adminToken: ADMIN_TOKEN, name: 'Eve' }), routeParams)

    expect(vi.mocked(prisma.player.create)).toHaveBeenCalledWith({
      data: { tournamentId: 'tid1', name: 'Eve', rating: null, seed: 6 },
    })
  })

  it('assigns seed 1 to the first player of an empty tournament', async () => {
    givenTournamentExists({ players: [] })
    vi.mocked(prisma.player.create).mockResolvedValueOnce({} as any)

    await POST(addPlayerRequest({ adminToken: ADMIN_TOKEN, name: 'Alice' }), routeParams)

    expect(vi.mocked(prisma.player.create)).toHaveBeenCalledWith({
      data: { tournamentId: 'tid1', name: 'Alice', rating: null, seed: 1 },
    })
  })
})

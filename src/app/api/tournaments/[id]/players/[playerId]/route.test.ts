/**
 * Setting a player's fixed board number (PATCH /api/tournaments/[id]/players/[playerId])
 *
 * Lets the organiser pin a specific player to a specific board number every
 * round - e.g. a streamer whose camera/equipment can't move. Admin-only.
 * Passing `fixedBoard: null` clears the pin.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    tournament: { findUnique: vi.fn() },
    player:     { findUnique: vi.fn(), update: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { PATCH } from './route'

// ─── Request & fixture helpers ────────────────────────────────────────────────

const routeParams = { params: Promise.resolve({ id: 'tid1', playerId: 'pid1' }) }

function patchRequest(adminToken: string, fixedBoard: number | null) {
  return new NextRequest('http://localhost/api/tournaments/tid1/players/pid1', {
    method: 'PATCH',
    body: JSON.stringify({ adminToken, fixedBoard }),
    headers: { 'Content-Type': 'application/json' },
  })
}

const tournament = { id: 'tid1', adminToken: 'correct-admin-token' }
const player = { id: 'pid1', tournamentId: 'tid1', name: 'Streamer', fixedBoard: null }

function givenTournamentAndPlayerExist(overrides: Record<string, unknown> = {}) {
  vi.mocked(prisma.tournament.findUnique).mockResolvedValueOnce(tournament as any)
  vi.mocked(prisma.player.findUnique).mockResolvedValueOnce({ ...player, ...overrides } as any)
  vi.mocked(prisma.player.update).mockResolvedValueOnce({} as any)
}

beforeEach(() => vi.clearAllMocks())

// ─── Access control ───────────────────────────────────────────────────────────

describe('Access control', () => {
  it('returns 404 when the tournament does not exist', async () => {
    vi.mocked(prisma.tournament.findUnique).mockResolvedValueOnce(null)

    const response = await PATCH(patchRequest('correct-admin-token', 3), routeParams)

    expect(response.status).toBe(404)
  })

  it('returns 403 when the admin token is incorrect', async () => {
    vi.mocked(prisma.tournament.findUnique).mockResolvedValueOnce(tournament as any)

    const response = await PATCH(patchRequest('wrong-token', 3), routeParams)

    expect(response.status).toBe(403)
    expect(vi.mocked(prisma.player.update)).not.toHaveBeenCalled()
  })

  it('returns 404 when the player belongs to a different tournament (prevents cross-tournament access)', async () => {
    vi.mocked(prisma.tournament.findUnique).mockResolvedValueOnce(tournament as any)
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce({ ...player, tournamentId: 'other-tid' } as any)

    const response = await PATCH(patchRequest('correct-admin-token', 3), routeParams)

    expect(response.status).toBe(404)
    expect(vi.mocked(prisma.player.update)).not.toHaveBeenCalled()
  })

  it('returns 404 when the player does not exist', async () => {
    vi.mocked(prisma.tournament.findUnique).mockResolvedValueOnce(tournament as any)
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce(null)

    const response = await PATCH(patchRequest('correct-admin-token', 3), routeParams)

    expect(response.status).toBe(404)
  })
})

// ─── Validation ───────────────────────────────────────────────────────────────

describe('Validation', () => {
  it('rejects a non-integer board number', async () => {
    givenTournamentAndPlayerExist()

    const response = await PATCH(patchRequest('correct-admin-token', 2.5), routeParams)

    expect(response.status).toBe(400)
    expect(vi.mocked(prisma.player.update)).not.toHaveBeenCalled()
  })

  it('rejects a board number below 1', async () => {
    givenTournamentAndPlayerExist()

    const response = await PATCH(patchRequest('correct-admin-token', 0), routeParams)

    expect(response.status).toBe(400)
    expect(vi.mocked(prisma.player.update)).not.toHaveBeenCalled()
  })
})

// ─── Setting and clearing the pin ─────────────────────────────────────────────

describe('Setting the fixed board', () => {
  it('saves the board number the organiser chose', async () => {
    givenTournamentAndPlayerExist()

    const response = await PATCH(patchRequest('correct-admin-token', 3), routeParams)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(vi.mocked(prisma.player.update)).toHaveBeenCalledWith({
      where: { id: 'pid1' },
      data: { fixedBoard: 3 },
    })
  })

  it('clears a previously-set fixed board when passed null', async () => {
    givenTournamentAndPlayerExist({ fixedBoard: 3 })

    const response = await PATCH(patchRequest('correct-admin-token', null), routeParams)

    expect(response.status).toBe(200)
    expect(vi.mocked(prisma.player.update)).toHaveBeenCalledWith({
      where: { id: 'pid1' },
      data: { fixedBoard: null },
    })
  })
})

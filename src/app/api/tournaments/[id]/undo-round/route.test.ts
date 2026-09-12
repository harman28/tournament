/**
 * Undoing the last round (POST /api/tournaments/[id]/undo-round)
 *
 * Real scenario from testing: a result got entered wrong in an earlier
 * round, but wasn't noticed until the next round had already been
 * generated (and possibly partly played) from that wrong data. Fixing the
 * old result is already possible at any time via the admin PATCH on
 * games/[gameId]/result; this route is the other half - discard the round
 * that was generated from the wrong data, so Next Round can regenerate it
 * once the earlier result is corrected.
 *
 * Only ever undoes the single latest round - admin-only.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    tournament: { findUnique: vi.fn(), update: vi.fn() },
    round:      { delete: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { POST } from './route'

// ─── Request & fixture helpers ────────────────────────────────────────────────

const routeParams = { params: Promise.resolve({ id: 'tid1' }) }

function undoRequest(adminToken: string) {
  return new NextRequest('http://localhost/api/tournaments/tid1/undo-round', {
    method: 'POST',
    body: JSON.stringify({ adminToken }),
    headers: { 'Content-Type': 'application/json' },
  })
}

const ADMIN_TOKEN = 'correct-admin-token'

function givenTournamentExists(rounds: Array<{ id: string; number: number }>, overrides: Record<string, unknown> = {}) {
  vi.mocked(prisma.tournament.findUnique).mockResolvedValueOnce({
    id: 'tid1',
    adminToken: ADMIN_TOKEN,
    status: 'active',
    rounds,
    ...overrides,
  } as any)
}

beforeEach(() => vi.clearAllMocks())

// ─── Access control ───────────────────────────────────────────────────────────

describe('Access control', () => {
  it('returns 404 when the tournament does not exist', async () => {
    vi.mocked(prisma.tournament.findUnique).mockResolvedValueOnce(null)

    const response = await POST(undoRequest(ADMIN_TOKEN), routeParams)

    expect(response.status).toBe(404)
  })

  it('returns 403 when the admin token is incorrect', async () => {
    givenTournamentExists([{ id: 'r1', number: 1 }])

    const response = await POST(undoRequest('wrong-token'), routeParams)

    expect(response.status).toBe(403)
    expect(vi.mocked(prisma.round.delete)).not.toHaveBeenCalled()
  })
})

// ─── State guards ─────────────────────────────────────────────────────────────

describe('State guards', () => {
  it('returns 400 when there are no rounds to undo', async () => {
    givenTournamentExists([], { status: 'setup' })

    const response = await POST(undoRequest(ADMIN_TOKEN), routeParams)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('No rounds to undo')
    expect(vi.mocked(prisma.round.delete)).not.toHaveBeenCalled()
  })
})

// ─── Undoing ──────────────────────────────────────────────────────────────────

describe('Undoing the last round', () => {
  it('deletes only the highest-numbered round, not an earlier one', async () => {
    givenTournamentExists([
      { id: 'r1', number: 1 },
      { id: 'r2', number: 2 },
      { id: 'r3', number: 3 },
    ])
    vi.mocked(prisma.round.delete).mockResolvedValueOnce({} as any)
    vi.mocked(prisma.tournament.update).mockResolvedValueOnce({} as any)

    const response = await POST(undoRequest(ADMIN_TOKEN), routeParams)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.undoneRound).toBe(3)
    expect(vi.mocked(prisma.round.delete)).toHaveBeenCalledWith({ where: { id: 'r3' } })
  })

  it('stays "active" when other rounds remain', async () => {
    givenTournamentExists([{ id: 'r1', number: 1 }, { id: 'r2', number: 2 }])
    vi.mocked(prisma.round.delete).mockResolvedValueOnce({} as any)
    vi.mocked(prisma.tournament.update).mockResolvedValueOnce({} as any)

    const response = await POST(undoRequest(ADMIN_TOKEN), routeParams)
    const body = await response.json()

    expect(body.status).toBe('active')
    expect(vi.mocked(prisma.tournament.update)).toHaveBeenCalledWith({
      where: { id: 'tid1' },
      data: { status: 'active' },
    })
  })

  it('reverts to "setup" when undoing the only (first) round', async () => {
    givenTournamentExists([{ id: 'r1', number: 1 }])
    vi.mocked(prisma.round.delete).mockResolvedValueOnce({} as any)
    vi.mocked(prisma.tournament.update).mockResolvedValueOnce({} as any)

    const response = await POST(undoRequest(ADMIN_TOKEN), routeParams)
    const body = await response.json()

    expect(body.status).toBe('setup')
    expect(vi.mocked(prisma.tournament.update)).toHaveBeenCalledWith({
      where: { id: 'tid1' },
      data: { status: 'setup' },
    })
  })

  it('reverts a "complete" tournament back to "active" when undoing the final round', async () => {
    givenTournamentExists([{ id: 'r1', number: 1 }, { id: 'r2', number: 2 }], { status: 'complete' })
    vi.mocked(prisma.round.delete).mockResolvedValueOnce({} as any)
    vi.mocked(prisma.tournament.update).mockResolvedValueOnce({} as any)

    const response = await POST(undoRequest(ADMIN_TOKEN), routeParams)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe('active')
  })
})

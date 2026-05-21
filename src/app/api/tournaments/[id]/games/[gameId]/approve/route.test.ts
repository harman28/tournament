/**
 * Approving or rejecting a pending result  (POST /api/tournaments/[id]/games/[gameId]/approve)
 *
 * When a player submits a result it is stored as "pending" and waits for
 * the organiser to review it. The organiser can either:
 *
 *   Approve — promotes the pending result to the official result
 *   Reject  — clears the pending result so the players can resubmit
 *
 * Both actions require the admin token. A game with no pending result
 * cannot be approved or rejected.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    game: {
      findUnique: vi.fn(),
      update:     vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { POST } from './route'

// ─── Request & fixture helpers ────────────────────────────────────────────────

const routeParams = { params: Promise.resolve({ id: 'tid1', gameId: 'gid1' }) }

function approveRequest(adminToken: string, reject = false) {
  return new NextRequest('http://localhost/api/tournaments/tid1/games/gid1/approve', {
    method: 'POST',
    body: JSON.stringify({ adminToken, reject }),
    headers: { 'Content-Type': 'application/json' },
  })
}

// A game where Alice has submitted a pending result that awaits organiser review
const gameWithPendingResult = {
  id:            'gid1',
  result:        null,          // ← no official result yet
  pendingResult: '1-0',         // ← Alice submitted this
  pendingBy:     'Alice',
  whitePlayerId: 'Alice',
  blackPlayerId: 'Bob',
  byePlayerId:   null,
  roundId:       'r1',
  round: {
    id:           'r1',
    tournamentId: 'tid1',
    tournament:   { id: 'tid1', adminToken: 'correct-admin-token' },
  },
}

function givenGameHasPendingResult(overrides: Record<string, unknown> = {}) {
  vi.mocked(prisma.game.findUnique).mockResolvedValueOnce({
    ...gameWithPendingResult,
    ...overrides,
  } as any)
  vi.mocked(prisma.game.update).mockResolvedValueOnce({} as any)
}

beforeEach(() => vi.clearAllMocks())

// ─── Access control ───────────────────────────────────────────────────────────

describe('Access control', () => {
  it('returns 404 when the game ID does not exist', async () => {
    vi.mocked(prisma.game.findUnique).mockResolvedValueOnce(null)

    const response = await POST(approveRequest('correct-admin-token'), routeParams)

    expect(response.status).toBe(404)
  })

  it('returns 404 when the game belongs to a different tournament (prevents cross-tournament access)', async () => {
    givenGameHasPendingResult({ round: { ...gameWithPendingResult.round, tournamentId: 'other-tid' } })

    const response = await POST(approveRequest('correct-admin-token'), routeParams)

    expect(response.status).toBe(404)
  })

  it('returns 403 when the admin token is incorrect', async () => {
    givenGameHasPendingResult()

    const response = await POST(approveRequest('wrong-token'), routeParams)

    expect(response.status).toBe(403)
    expect(vi.mocked(prisma.game.update)).not.toHaveBeenCalled()
  })
})

// ─── State guards ─────────────────────────────────────────────────────────────

describe('State guards', () => {
  it('returns 400 when there is no pending result to approve or reject', async () => {
    givenGameHasPendingResult({ pendingResult: null })

    const response = await POST(approveRequest('correct-admin-token'), routeParams)
    const body     = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('No pending result')
  })
})

// ─── Approving a result ───────────────────────────────────────────────────────

describe('Approving a pending result', () => {
  it('promotes the pending result to the official result and clears the pending fields', async () => {
    givenGameHasPendingResult() // pendingResult = '1-0'

    const response = await POST(approveRequest('correct-admin-token'), routeParams)
    const body     = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)

    expect(vi.mocked(prisma.game.update)).toHaveBeenCalledWith({
      where: { id: 'gid1' },
      data:  { result: '1-0', pendingResult: null, pendingBy: null },
    })
  })
})

// ─── Rejecting a result ───────────────────────────────────────────────────────

describe('Rejecting a pending result', () => {
  it('clears the pending result without setting an official result, allowing resubmission', async () => {
    givenGameHasPendingResult() // pendingResult = '1-0' (disputed)

    const response = await POST(approveRequest('correct-admin-token', true /* reject */), routeParams)
    const body     = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)

    expect(vi.mocked(prisma.game.update)).toHaveBeenCalledWith({
      where: { id: 'gid1' },
      data:  { pendingResult: null, pendingBy: null },
      // Note: `result` is intentionally absent — the game remains undecided
    })
  })
})

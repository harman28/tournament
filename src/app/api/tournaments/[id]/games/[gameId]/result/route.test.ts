/**
 * Submitting a game result
 *
 * Two roles can record a result:
 *
 *   POST  — a player (or spectator) submits a "pending" result.
 *           It is stored as pendingResult and must be approved by the organiser
 *           before it becomes official.
 *
 *   PATCH — the organiser enters a result directly (no approval step).
 *           Requires the admin token.
 *
 * Valid result strings: "1-0" (white wins), "0-1" (black wins), "1/2-1/2" (draw).
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
import { POST, PATCH } from './route'

// ─── Request & fixture helpers ────────────────────────────────────────────────

const routeParams = { params: Promise.resolve({ id: 'tid1', gameId: 'gid1' }) }

function playerSubmitsResult(result: string, submittedBy = 'Alice') {
  return new NextRequest('http://localhost/api/tournaments/tid1/games/gid1/result', {
    method: 'POST',
    body: JSON.stringify({ result, submittedBy }),
    headers: { 'Content-Type': 'application/json' },
  })
}

function adminEntersResult(result: string, adminToken = 'correct-admin-token') {
  return new NextRequest('http://localhost/api/tournaments/tid1/games/gid1/result', {
    method: 'PATCH',
    body: JSON.stringify({ result, adminToken }),
    headers: { 'Content-Type': 'application/json' },
  })
}

// A game that is in progress (no result yet) and belongs to tournament tid1
const gameInProgress = {
  id:            'gid1',
  result:        null, // ← no official result yet
  pendingResult: null,
  pendingBy:     null,
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

function givenGameExists(overrides: Record<string, unknown> = {}) {
  vi.mocked(prisma.game.findUnique).mockResolvedValueOnce({
    ...gameInProgress,
    ...overrides,
  } as any)
  vi.mocked(prisma.game.update).mockResolvedValueOnce({} as any)
}

beforeEach(() => vi.clearAllMocks())

// ─── Player-submitted results (POST) ─────────────────────────────────────────

describe('Player submitting a result (POST)', () => {
  describe('Validation', () => {
    it('rejects any result string other than "1-0", "0-1", or "1/2-1/2"', async () => {
      const response = await POST(playerSubmitsResult('2-0'), routeParams)

      expect(response.status).toBe(400)
      expect(vi.mocked(prisma.game.findUnique)).not.toHaveBeenCalled()
    })

    it('returns 404 when the game ID does not exist', async () => {
      vi.mocked(prisma.game.findUnique).mockResolvedValueOnce(null)

      const response = await POST(playerSubmitsResult('1-0'), routeParams)

      expect(response.status).toBe(404)
    })

    it('returns 404 when the game belongs to a different tournament (prevents cross-tournament tampering)', async () => {
      givenGameExists({ round: { ...gameInProgress.round, tournamentId: 'other-tournament' } })

      const response = await POST(playerSubmitsResult('1-0'), routeParams)

      expect(response.status).toBe(404)
    })

    it('returns 400 when the game already has an official result', async () => {
      givenGameExists({ result: '1-0' }) // ← already decided

      const response = await POST(playerSubmitsResult('0-1'), routeParams)
      const body     = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('Result already entered')
    })
  })

  describe('Successful submission', () => {
    it.each(['1-0', '0-1', '1/2-1/2'])('accepts the valid result "%s" and queues it for approval', async (result) => {
      givenGameExists()

      const response = await POST(playerSubmitsResult(result), routeParams)
      const body     = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
    })

    it('stores the result as pending (not official) so the organiser can review it', async () => {
      givenGameExists()

      await POST(playerSubmitsResult('1-0', 'Alice'), routeParams)

      expect(vi.mocked(prisma.game.update)).toHaveBeenCalledWith({
        where: { id: 'gid1' },
        data:  { pendingResult: '1-0', pendingBy: 'Alice' },
      })
    })

    it('records "Anonymous" as the submitter when no name is provided', async () => {
      givenGameExists()

      await POST(playerSubmitsResult('1-0', ''), routeParams)

      const updateData = vi.mocked(prisma.game.update).mock.calls[0][0].data
      expect(updateData.pendingBy).toBe('Anonymous')
    })
  })
})

// ─── Organiser-entered results (PATCH) ───────────────────────────────────────

describe('Organiser entering a result directly (PATCH)', () => {
  describe('Validation and access control', () => {
    it('rejects any result string other than "1-0", "0-1", or "1/2-1/2"', async () => {
      const response = await PATCH(adminEntersResult('draw'), routeParams)

      expect(response.status).toBe(400)
    })

    it('returns 404 when the game does not exist', async () => {
      vi.mocked(prisma.game.findUnique).mockResolvedValueOnce(null)

      const response = await PATCH(adminEntersResult('1-0'), routeParams)

      expect(response.status).toBe(404)
    })

    it('returns 403 when the admin token is wrong', async () => {
      givenGameExists()

      const response = await PATCH(adminEntersResult('1-0', 'wrong-token'), routeParams)

      expect(response.status).toBe(403)
    })
  })

  describe('Successful entry', () => {
    it('sets the official result immediately and clears any pending submission', async () => {
      givenGameExists()

      const response = await PATCH(adminEntersResult('0-1'), routeParams)
      const body     = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)

      expect(vi.mocked(prisma.game.update)).toHaveBeenCalledWith({
        where: { id: 'gid1' },
        data:  { result: '0-1', pendingResult: null, pendingBy: null },
      })
    })

    it('can overwrite a pending player submission by entering the result directly', async () => {
      // A player submitted "1-0" but the organiser enters "1/2-1/2" instead
      givenGameExists({ pendingResult: '1-0', pendingBy: 'Alice' })

      await PATCH(adminEntersResult('1/2-1/2'), routeParams)

      const updateData = vi.mocked(prisma.game.update).mock.calls[0][0].data
      expect(updateData.result).toBe('1/2-1/2')
      expect(updateData.pendingResult).toBeNull()
    })
  })
})

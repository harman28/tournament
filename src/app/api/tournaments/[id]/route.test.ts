/**
 * Fetching a tournament  (GET /api/tournaments/[id])
 *
 * Returns the full tournament state to anyone with the public URL — players
 * and organiser alike. The response includes all rounds, games, and a
 * pre-computed standings table (so clients do not need to calculate scores).
 *
 * The admin token is included in the response but is only meaningful to the
 * organiser; the public UI uses it to detect whether the current user is the admin.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    tournament: {
      findUnique: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { GET } from './route'

const req = new NextRequest('http://localhost/api/tournaments/tid1')
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => vi.clearAllMocks())

// ─── Tournament not found ─────────────────────────────────────────────────────

describe('When the tournament ID does not exist', () => {
  it('returns 404 with an error message', async () => {
    vi.mocked(prisma.tournament.findUnique).mockResolvedValueOnce(null)

    const response = await GET(req, params('tid1'))
    const body     = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe('Not found')
  })
})

// ─── Tournament found ─────────────────────────────────────────────────────────

describe('When the tournament exists', () => {
  it('returns the tournament data together with a computed standings table', async () => {
    // Alice beat Bob in round 1
    vi.mocked(prisma.tournament.findUnique).mockResolvedValueOnce({
      id:         'tid1',
      name:       'Spring Classic',
      format:     'swiss',
      numRounds:  3,
      status:     'active',
      adminToken: 'secret-admin-token',
      players: [
        { id: 'Alice', seed: 1, rating: null, name: 'Alice' },
        { id: 'Bob',   seed: 2, rating: null, name: 'Bob'   },
      ],
      rounds: [
        {
          id:     'r1',
          number: 1,
          status: 'active',
          games: [
            {
              id:            'g1',
              whitePlayerId: 'Alice',
              blackPlayerId: 'Bob',
              byePlayerId:   null,
              result:        '1-0',
              pendingResult: null,
              pendingBy:     null,
              roundId:       'r1',
              white:     { id: 'Alice', seed: 1, rating: null, name: 'Alice' },
              black:     { id: 'Bob',   seed: 2, rating: null, name: 'Bob'   },
              byePlayer: null,
            },
          ],
        },
      ],
    } as any)

    const response = await GET(req, params('tid1'))
    const body     = await response.json()

    expect(response.status).toBe(200)
    expect(body.tournament.id).toBe('tid1')
    expect(Array.isArray(body.standings)).toBe(true)
  })

  it('ranks the winner above the loser in the standings', async () => {
    vi.mocked(prisma.tournament.findUnique).mockResolvedValueOnce({
      id: 'tid1', name: 'Cup', format: 'swiss', numRounds: 1,
      status: 'active', adminToken: 'secret',
      players: [
        { id: 'Alice', seed: 1, rating: null, name: 'Alice' },
        { id: 'Bob',   seed: 2, rating: null, name: 'Bob'   },
      ],
      rounds: [{
        id: 'r1', number: 1, status: 'complete',
        games: [{
          id: 'g1', whitePlayerId: 'Alice', blackPlayerId: 'Bob',
          byePlayerId: null, result: '1-0', pendingResult: null, pendingBy: null, roundId: 'r1',
          white: { id: 'Alice', seed: 1, rating: null, name: 'Alice' },
          black: { id: 'Bob',   seed: 2, rating: null, name: 'Bob'   },
          byePlayer: null,
        }],
      }],
    } as any)

    const body = await (await GET(req, params('tid1'))).json()

    expect(body.standings[0].player.id).toBe('Alice') // 1 point
    expect(body.standings[0].score).toBe(1)
    expect(body.standings[1].player.id).toBe('Bob')   // 0 points
  })
})

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { nanoid } from 'nanoid'

const MAX_NAME_LENGTH = 200
const MAX_PLAYER_NAME_LENGTH = 100
const MIN_PLAYERS = 2
const MAX_PLAYERS = 256
const MIN_ROUNDS = 1
const MAX_ROUNDS = 50

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, players, numRounds, format } = body as {
    name: string
    numRounds: number
    format: string
    players: Array<{ name: string; rating?: number | null }>
  }

  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.trim().length > MAX_NAME_LENGTH ||
    !Array.isArray(players) ||
    players.length < MIN_PLAYERS ||
    players.length > MAX_PLAYERS ||
    !players.every((p) => typeof p?.name === 'string' && p.name.trim() && p.name.trim().length <= MAX_PLAYER_NAME_LENGTH) ||
    !Number.isInteger(numRounds) ||
    numRounds < MIN_ROUNDS ||
    numRounds > MAX_ROUNDS
  ) {
    return Response.json({ error: 'Invalid input' }, { status: 400 })
  }

  const id = nanoid(8)
  const adminToken = nanoid(16)

  const tournament = await prisma.tournament.create({
    data: {
      id,
      adminToken,
      name: name.trim(),
      format: ['swiss', 'rr', 'drr'].includes(format) ? format : 'swiss',
      numRounds,
      players: {
        create: players.map((p, i) => ({
          name: p.name.trim(),
          rating: p.rating ?? null,
          seed: i + 1,
        })),
      },
    },
  })

  return Response.json({ id: tournament.id, adminToken })
}

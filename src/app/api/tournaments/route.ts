import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { nanoid } from 'nanoid'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, players, numRounds, format } = body as {
    name: string
    numRounds: number
    format: string
    players: Array<{ name: string; rating?: number | null }>
  }

  // Players are optional at creation time - a tournament can be created
  // empty and filled entirely via the invite link (POST .../players while
  // status is "setup", no admin token needed). The /start route enforces
  // the real minimum of 2 once the organiser is ready to begin.
  if (!name?.trim() || !Array.isArray(players)) {
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

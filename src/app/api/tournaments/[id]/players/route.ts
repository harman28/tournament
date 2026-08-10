import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { adminToken, name, rating } = await req.json()

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { players: true },
  })

  if (!tournament) return Response.json({ error: 'Not found' }, { status: 404 })
  if (tournament.adminToken !== adminToken)
    return Response.json({ error: 'Forbidden' }, { status: 403 })

  // Round Robin schedules are fixed by the circle method for a known player
  // count at round-1 time - there's no way to splice a new player into an
  // in-progress rotation without recomputing every remaining round's byes.
  // Swiss re-pairs from scratch each round anyway, so a late joiner just
  // slots in at 0 points from the next round on, same as swiss.ts already
  // treats any player with no game history.
  if (tournament.format !== 'swiss')
    return Response.json({ error: 'Late join is only supported for Swiss tournaments' }, { status: 400 })
  if (tournament.status !== 'active')
    return Response.json({ error: 'Tournament must be active to add a player' }, { status: 400 })

  if (typeof name !== 'string' || !name.trim())
    return Response.json({ error: 'Name is required' }, { status: 400 })
  if (rating !== undefined && rating !== null && typeof rating !== 'number')
    return Response.json({ error: 'Rating must be a number' }, { status: 400 })

  const nextSeed = tournament.players.reduce((max, p) => Math.max(max, p.seed), 0) + 1

  const player = await prisma.player.create({
    data: {
      tournamentId: id,
      name: name.trim(),
      rating: rating ?? null,
      seed: nextSeed,
    },
  })

  return Response.json({ player }, { status: 201 })
}

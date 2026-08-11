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

  // Two different callers hit this same endpoint:
  //  - during "setup", anyone with the (invite) link can add themselves -
  //    no admin token needed, same trust model as the link itself.
  //  - once "active", only the admin can add a late joiner, and only for
  //    Swiss - see the players/route.test.ts fixture notes for why Round
  //    Robin can't accept new entrants after its round-1 schedule is fixed.
  if (tournament.status === 'active') {
    if (tournament.adminToken !== adminToken)
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    if (tournament.format !== 'swiss')
      return Response.json({ error: 'Late join is only supported for Swiss tournaments' }, { status: 400 })
  } else if (tournament.status !== 'setup') {
    return Response.json({ error: 'Tournament has already finished' }, { status: 400 })
  }

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

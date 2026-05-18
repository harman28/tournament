import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateRound1Pairings, generateRoundRobinPairings } from '@/lib/swiss'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { adminToken } = await req.json()

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { players: true, rounds: true },
  })

  if (!tournament) return Response.json({ error: 'Not found' }, { status: 404 })
  if (tournament.adminToken !== adminToken)
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  if (tournament.status !== 'setup')
    return Response.json({ error: 'Already started' }, { status: 400 })

  const isRR = tournament.format === 'rr' || tournament.format === 'drr'
  const pairings = isRR
    ? generateRoundRobinPairings(tournament.players, 1, tournament.format === 'drr')
    : generateRound1Pairings(tournament.players)

  const round = await prisma.round.create({
    data: {
      tournamentId: id,
      number: 1,
      games: {
        create: pairings.map((p) =>
          p.type === 'bye'
            ? { byePlayerId: p.playerId, result: 'bye' }
            : { whitePlayerId: p.whiteId, blackPlayerId: p.blackId }
        ),
      },
    },
  })

  await prisma.tournament.update({ where: { id }, data: { status: 'active' } })
  return Response.json({ roundId: round.id })
}

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateRound1Pairings, generateRoundRobinPairings, assignBoardNumbers } from '@/lib/swiss'

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
  // Creation no longer requires players up front - a tournament can be
  // created empty and filled entirely via the invite link - so this can no
  // longer be assumed true by the time Start is pressed.
  if (tournament.players.length < 2)
    return Response.json({ error: 'Need at least 2 players to start' }, { status: 400 })

  const isRR = tournament.format === 'rr' || tournament.format === 'drr'
  const pairings = isRR
    ? generateRoundRobinPairings(tournament.players, 1, tournament.format === 'drr')
    : generateRound1Pairings(tournament.players)
  const numberedPairings = assignBoardNumbers(pairings, tournament.players)

  const round = await prisma.round.create({
    data: {
      tournamentId: id,
      number: 1,
      games: {
        create: numberedPairings.map((p) =>
          p.type === 'bye'
            ? { byePlayerId: p.playerId, result: 'bye' }
            : { whitePlayerId: p.whiteId, blackPlayerId: p.blackId, boardNumber: p.boardNumber }
        ),
      },
    },
  })

  await prisma.tournament.update({ where: { id }, data: { status: 'active' } })
  return Response.json({ roundId: round.id })
}

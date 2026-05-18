import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generatePairings, generateRoundRobinPairings } from '@/lib/swiss'
import { buildPlayerStates } from '@/lib/standings'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { adminToken } = await req.json()

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      players: true,
      rounds: {
        orderBy: { number: 'asc' },
        include: { games: true },
      },
    },
  })

  if (!tournament) return Response.json({ error: 'Not found' }, { status: 404 })
  if (tournament.adminToken !== adminToken)
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  if (tournament.status !== 'active')
    return Response.json({ error: 'Not active' }, { status: 400 })

  const currentRound = tournament.rounds[tournament.rounds.length - 1]
  if (!currentRound) return Response.json({ error: 'No rounds yet' }, { status: 400 })

  const incomplete = currentRound.games.filter((g) => !g.result)
  if (incomplete.length > 0)
    return Response.json({ error: 'Round not complete' }, { status: 400 })

  await prisma.round.update({ where: { id: currentRound.id }, data: { status: 'complete' } })

  const nextRoundNumber = currentRound.number + 1

  if (nextRoundNumber > tournament.numRounds) {
    await prisma.tournament.update({ where: { id }, data: { status: 'complete' } })
    return Response.json({ complete: true })
  }

  const allGames = tournament.rounds.flatMap((r) => r.games)
  const isRR = tournament.format === 'rr' || tournament.format === 'drr'

  const pairings = isRR
    ? generateRoundRobinPairings(tournament.players, nextRoundNumber, tournament.format === 'drr')
    : generatePairings(buildPlayerStates(tournament.players, allGames))

  const round = await prisma.round.create({
    data: {
      tournamentId: id,
      number: nextRoundNumber,
      games: {
        create: pairings.map((p) =>
          p.type === 'bye'
            ? { byePlayerId: p.playerId, result: 'bye' }
            : { whitePlayerId: p.whiteId, blackPlayerId: p.blackId }
        ),
      },
    },
  })

  return Response.json({ roundId: round.id, roundNumber: nextRoundNumber })
}

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { computeStandings } from '@/lib/standings'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      players: { orderBy: { seed: 'asc' } },
      rounds: {
        orderBy: { number: 'asc' },
        include: {
          games: {
            include: {
              white: true,
              black: true,
              byePlayer: true,
            },
          },
        },
      },
    },
  })

  if (!tournament) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const allGames = tournament.rounds.flatMap((r) => r.games)
  const standings = computeStandings(tournament.players, allGames)

  return Response.json({ tournament, standings })
}

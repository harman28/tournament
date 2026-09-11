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

  // adminToken must never leave this route — this endpoint is public and
  // unauthenticated, reachable with just the tournament ID from the shareable link.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { adminToken: _adminToken, ...publicTournament } = tournament

  return Response.json({ tournament: publicTournament, standings })
}

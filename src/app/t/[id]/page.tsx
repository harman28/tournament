import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { computeStandings } from '@/lib/standings'
import TournamentView from '@/components/TournamentView'

export default async function TournamentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      players: { orderBy: { seed: 'asc' } },
      rounds: {
        orderBy: { number: 'asc' },
        include: {
          games: {
            include: { white: true, black: true, byePlayer: true },
            orderBy: { id: 'asc' },
          },
        },
      },
    },
  })

  if (!tournament) notFound()

  // Tiebreaker rounds must never affect the main Score/Buchholz columns -
  // only the main rounds feed the standings calculation.
  const mainGames = tournament.rounds.filter((r) => !r.isTiebreaker).flatMap((r) => r.games)
  const standings = computeStandings(tournament.players, mainGames)

  return <TournamentView tournament={tournament} standings={standings} />
}

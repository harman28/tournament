import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { computeStandings } from '@/lib/standings'
import TournamentView from '@/components/TournamentView'

export default async function AdminPage({
  params,
}: {
  params: Promise<{ id: string; token: string }>
}) {
  const { id, token } = await params

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
  if (tournament.adminToken !== token) redirect(`/t/${id}`)

  const allGames = tournament.rounds.flatMap((r) => r.games)
  const standings = computeStandings(tournament.players, allGames)

  return (
    <TournamentView tournament={tournament} standings={standings} adminToken={token} />
  )
}

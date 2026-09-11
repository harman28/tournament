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

  const allGames = tournament.rounds.flatMap((r) => r.games)
  const standings = computeStandings(tournament.players, allGames)

  // adminToken must never reach the public page — everything passed to a client
  // component is serialized into the page's payload, whether or not it's read.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { adminToken: _adminToken, ...publicTournament } = tournament

  return <TournamentView tournament={publicTournament} standings={standings} />
}

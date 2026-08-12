import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { computeStandings } from '@/lib/standings'
import { formatLabel } from '@/lib/swiss'
import TournamentView from '@/components/TournamentView'

// Drives the WhatsApp/iMessage/Slack/etc link preview when this URL (the
// same "invite link" used for self-signup) gets shared - see
// opengraph-image.tsx in this same route segment for the accompanying image.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { _count: { select: { players: true } } },
  })
  if (!tournament) return {}

  const description = tournamentDescription(tournament.format, tournament.numRounds, tournament._count.players, tournament.status)

  return {
    title: tournament.name,
    description,
    openGraph: { title: tournament.name, description, type: 'website' },
  }
}

export function tournamentDescription(format: string, numRounds: number, playerCount: number, status: string): string {
  const base = `${formatLabel(format)} · ${numRounds} rounds · ${playerCount} player${playerCount === 1 ? '' : 's'}`
  if (status === 'setup') return `${base} - tap to join`
  if (status === 'active') return `${base} - live now`
  return `${base} - completed`
}

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

  return <TournamentView tournament={tournament} standings={standings} />
}

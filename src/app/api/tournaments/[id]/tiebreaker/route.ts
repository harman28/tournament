import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateRoundRobinPairings, assignBoardNumbers, recommendedRounds } from '@/lib/swiss'
import { computeStandings } from '@/lib/standings'
import { tiedForFirst, resolveTiebreakAttempt } from '@/lib/tiebreak'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { adminToken, manualWinnerId } = await req.json()

  return prisma.$transaction(async (tx) => {
    const tournament = await tx.tournament.findUnique({
      where: { id },
      include: {
        players: true,
        rounds: { include: { games: true } },
      },
    })

    if (!tournament) return Response.json({ error: 'Not found' }, { status: 404 })
    if (tournament.adminToken !== adminToken)
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    if (tournament.status !== 'complete')
      return Response.json({ error: 'Tournament is not complete yet' }, { status: 400 })
    if (tournament.tiebreakWinnerId)
      return Response.json({ error: 'Tiebreak already resolved' }, { status: 400 })

    // Recompute the tied group entirely server-side - never trust a
    // client-supplied participant list.
    const mainGames = tournament.rounds.filter((r) => !r.isTiebreaker).flatMap((r) => r.games)
    const standings = computeStandings(tournament.players, mainGames)
    const originalTiedGroup = tiedForFirst(standings)

    if (originalTiedGroup.length < 2)
      return Response.json({ error: 'No tie for 1st place' }, { status: 400 })

    const tiebreakRounds = tournament.rounds.filter((r) => r.isTiebreaker)
    const attemptNumbers = tiebreakRounds.map((r) => r.tiebreakAttempt ?? 0)
    const latestAttempt = attemptNumbers.length ? Math.max(...attemptNumbers) : 0
    const latestAttemptRounds = tiebreakRounds.filter((r) => r.tiebreakAttempt === latestAttempt)
    const latestAttemptGames = latestAttemptRounds.flatMap((r) => r.games)
    const latestAttemptComplete = latestAttemptRounds.length > 0 && latestAttemptGames.every((g) => !!g.result)

    if (latestAttemptRounds.length > 0 && !latestAttemptComplete)
      return Response.json({ error: 'A tiebreaker attempt is already in progress' }, { status: 400 })

    // Determine the currently-tied group: the original tie, or - if a
    // completed attempt still didn't resolve it - that attempt's own
    // still-tied subset.
    let currentGroup = originalTiedGroup
    if (latestAttemptComplete) {
      const participantIds = Array.from(
        new Set(
          latestAttemptGames.flatMap((g) =>
            [g.whitePlayerId, g.blackPlayerId, g.byePlayerId].filter((x): x is string => !!x)
          )
        )
      )
      const { winnerId, scores } = resolveTiebreakAttempt(participantIds, latestAttemptGames)
      if (winnerId) {
        // Already resolved by the last attempt's result - nothing left to do.
        await tx.tournament.update({ where: { id }, data: { tiebreakWinnerId: winnerId } })
        return Response.json({ resolved: true, winnerId })
      }
      const maxScore = Math.max(...Object.values(scores))
      currentGroup = tournament.players.filter((p) => participantIds.includes(p.id) && scores[p.id] === maxScore)
    }

    if (manualWinnerId) {
      if (!currentGroup.some((p) => p.id === manualWinnerId))
        return Response.json({ error: 'That player is not part of the current tied group' }, { status: 400 })
      await tx.tournament.update({ where: { id }, data: { tiebreakWinnerId: manualWinnerId } })
      return Response.json({ resolved: true, winnerId: manualWinnerId })
    }

    const K = recommendedRounds(currentGroup.length, 'rr')
    const maxExistingNumber = Math.max(0, ...tournament.rounds.map((r) => r.number))
    const nextAttempt = latestAttempt + 1

    for (let localRound = 1; localRound <= K; localRound++) {
      const pairings = generateRoundRobinPairings(currentGroup, localRound, false)
      const numberedPairings = assignBoardNumbers(pairings, tournament.players)
      await tx.round.create({
        data: {
          tournamentId: id,
          number: maxExistingNumber + localRound,
          isTiebreaker: true,
          tiebreakAttempt: nextAttempt,
          games: {
            create: numberedPairings.map((p) =>
              p.type === 'bye'
                ? { byePlayerId: p.playerId, result: 'bye' }
                : { whitePlayerId: p.whiteId, blackPlayerId: p.blackId, boardNumber: p.boardNumber }
            ),
          },
        },
      })
    }

    return Response.json({ started: true, attempt: nextAttempt, rounds: K })
  })
}

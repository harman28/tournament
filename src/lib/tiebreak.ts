import type { Player, Game } from '@prisma/client'
import type { Standing } from './standings'
import { prisma } from './prisma'

// Tiebreakers only ever resolve a tie for RANK 1 (determining the outright
// winner) - ties further down the standings stay as-is, resolved by Buchholz
// like today. See tournament/CLAUDE.md for the full design rationale.

export function tiedForFirst(standings: Standing[]): Player[] {
  return standings.filter((s) => s.rank === 1).map((s) => s.player)
}

type MinimalGame = Pick<Game, 'whitePlayerId' | 'blackPlayerId' | 'byePlayerId' | 'result'>

// Score-only tally among a closed group (win=1, draw=0.5, bye=1) - deliberately
// does NOT reuse computeStandings' full score->Buchholz->wins->seed chain.
// Buchholz is mathematically constant for everyone inside a closed round-robin
// group (it reduces to a fixed group-total minus their own score), so it can
// never differentiate a genuine tie here. Wins-as-secondary-sort would silently
// resolve a score-tie (e.g. 1 win+1 draw+1 loss vs 3 draws, both 1.5 points)
// without another game being played, which isn't what a "tiebreaker match" is
// for - if the scores are equal, it's still tied, full stop.
export function resolveTiebreakAttempt(
  participantIds: string[],
  games: MinimalGame[]
): { winnerId: string | null; scores: Record<string, number> } {
  const scores: Record<string, number> = {}
  for (const id of participantIds) scores[id] = 0

  for (const game of games) {
    if (!game.result) continue
    if (game.byePlayerId) {
      if (scores[game.byePlayerId] !== undefined) scores[game.byePlayerId] += 1
      continue
    }
    if (!game.whitePlayerId || !game.blackPlayerId) continue
    if (game.result === '1-0') {
      if (scores[game.whitePlayerId] !== undefined) scores[game.whitePlayerId] += 1
    } else if (game.result === '0-1') {
      if (scores[game.blackPlayerId] !== undefined) scores[game.blackPlayerId] += 1
    } else if (game.result === '1/2-1/2') {
      if (scores[game.whitePlayerId] !== undefined) scores[game.whitePlayerId] += 0.5
      if (scores[game.blackPlayerId] !== undefined) scores[game.blackPlayerId] += 0.5
    }
  }

  const maxScore = Math.max(...Object.values(scores))
  const topScorers = participantIds.filter((id) => scores[id] === maxScore)

  return { winnerId: topScorers.length === 1 ? topScorers[0] : null, scores }
}

// Called after any write that sets Game.result on a tiebreaker-round game
// (the admin-direct PATCH and the approve-a-pending-result POST - the plain
// POST only ever writes pendingResult, never result, so it never needs this).
// Short-circuits immediately for the common non-tiebreak case.
export async function maybeResolveTiebreak(gameId: string): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: { round: true },
  })
  if (!game || !game.round.isTiebreaker || game.round.tiebreakAttempt == null) return

  const tournamentId = game.round.tournamentId
  const attemptRounds = await prisma.round.findMany({
    where: { tournamentId, isTiebreaker: true, tiebreakAttempt: game.round.tiebreakAttempt },
    include: { games: true },
  })

  const allGames = attemptRounds.flatMap((r) => r.games)
  if (!allGames.every((g) => !!g.result)) return // attempt not finished yet

  const participantIds = Array.from(
    new Set(
      allGames.flatMap((g) => [g.whitePlayerId, g.blackPlayerId, g.byePlayerId].filter((id): id is string => !!id))
    )
  )

  const { winnerId } = resolveTiebreakAttempt(participantIds, allGames)
  if (!winnerId) return // still tied - UI offers another attempt

  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } })
  if (tournament && !tournament.tiebreakWinnerId) {
    await prisma.tournament.update({ where: { id: tournamentId }, data: { tiebreakWinnerId: winnerId } })
  }
}

/**
 * Tiebreaker resolution logic
 *
 * A tiebreaker only ever exists to resolve a tie for RANK 1 (determining the
 * outright winner). resolveTiebreakAttempt() is deliberately score-only - it
 * must NOT reuse computeStandings' Buchholz/wins tiebreak chain, because:
 *
 *   - Buchholz is mathematically constant for everyone inside a closed group
 *     (it reduces to a fixed group-total minus their own score), so it can
 *     never differentiate a genuine tie here.
 *   - Using "wins" as a secondary sort would silently resolve a score-tie
 *     (e.g. 1 win + 1 draw + 1 loss vs. 3 draws, both 1.5 points) without
 *     another game being played - which defeats the entire point of a
 *     tiebreaker "match".
 */

import { describe, it, expect } from 'vitest'
import { tiedForFirst, resolveTiebreakAttempt } from './tiebreak'
import type { Standing } from './standings'
import type { Player } from '@prisma/client'

function player(id: string, seed: number): Player {
  return {
    id,
    tournamentId: 'tid1',
    name: id,
    rating: null,
    seed,
    fixedBoard: null,
  } as Player
}

function standing(p: Player, score: number, rank: number): Standing {
  return { player: p, score, buchholz: 0, wins: 0, gamesPlayed: 0, rank }
}

type G = { whitePlayerId: string | null; blackPlayerId: string | null; byePlayerId: string | null; result: string | null }

function game(white: string, black: string, result: string | null): G {
  return { whitePlayerId: white, blackPlayerId: black, byePlayerId: null, result }
}

function bye(playerId: string, result: string | null = 'bye'): G {
  return { whitePlayerId: null, blackPlayerId: null, byePlayerId: playerId, result }
}

// ─── tiedForFirst ─────────────────────────────────────────────────────────────

describe('tiedForFirst', () => {
  it('returns just the sole leader (a group of one) when nobody else shares rank 1 - not a real tie, caller checks length > 1', () => {
    const a = player('A', 1), b = player('B', 2)
    const standings = [standing(a, 3, 1), standing(b, 2, 2)]
    expect(tiedForFirst(standings).map((p) => p.id)).toEqual(['A'])
  })

  it('returns every player sharing rank 1', () => {
    const a = player('A', 1), b = player('B', 2), c = player('C', 3)
    const standings = [standing(a, 2, 1), standing(b, 2, 1), standing(c, 1, 3)]
    expect(tiedForFirst(standings).map((p) => p.id).sort()).toEqual(['A', 'B'])
  })

  it('does not include a tie further down the standings (e.g. for 3rd)', () => {
    const a = player('A', 1), b = player('B', 2), c = player('C', 3)
    const standings = [standing(a, 3, 1), standing(b, 1, 2), standing(c, 1, 2)]
    expect(tiedForFirst(standings).map((p) => p.id)).toEqual(['A'])
  })
})

// ─── resolveTiebreakAttempt ────────────────────────────────────────────────────

describe('resolveTiebreakAttempt', () => {
  it('resolves a decisive 2-player game', () => {
    const result = resolveTiebreakAttempt(['A', 'B'], [game('A', 'B', '1-0')])
    expect(result.winnerId).toBe('A')
  })

  it('leaves a 2-player draw still tied', () => {
    const result = resolveTiebreakAttempt(['A', 'B'], [game('A', 'B', '1/2-1/2')])
    expect(result.winnerId).toBeNull()
  })

  it('resolves a 3-player group with one clear winner', () => {
    // A beats both B and C; B and C split their own game
    const games = [game('A', 'B', '1-0'), game('A', 'C', '1-0'), game('B', 'C', '1/2-1/2')]
    const result = resolveTiebreakAttempt(['A', 'B', 'C'], games)
    expect(result.winnerId).toBe('A')
    expect(result.scores).toEqual({ A: 2, B: 0.5, C: 0.5 })
  })

  it('stays tied on a perfect 3-player cycle even though win-counts differ from a draw-heavy alternative', () => {
    // A beats B, B beats C, C beats A - every player: 1 win, 1 loss, score 1.
    // This is the scenario that would silently "resolve" if wins were used as
    // a secondary sort instead of stopping at score.
    const games = [game('A', 'B', '1-0'), game('B', 'C', '1-0'), game('C', 'A', '1-0')]
    const result = resolveTiebreakAttempt(['A', 'B', 'C'], games)
    expect(result.winnerId).toBeNull()
    expect(result.scores).toEqual({ A: 1, B: 1, C: 1 })
  })

  it('handles an odd-sized group with a real bye, scoring it same as a win', () => {
    // 3-player round-robin needs a bye each round; give A a bye (worth 1pt)
    // then have A lose their one real game - still ties with a 1-0 winner.
    const games = [bye('A'), game('B', 'C', '1-0')]
    const result = resolveTiebreakAttempt(['A', 'B', 'C'], games)
    // A: 1 (bye), B: 1 (win), C: 0 -> A and B tied at 1, still unresolved
    expect(result.winnerId).toBeNull()
    expect(result.scores).toEqual({ A: 1, B: 1, C: 0 })
  })

  it('ignores games not yet decided (no result)', () => {
    const result = resolveTiebreakAttempt(['A', 'B'], [game('A', 'B', null)])
    expect(result.winnerId).toBeNull()
    expect(result.scores).toEqual({ A: 0, B: 0 })
  })
})

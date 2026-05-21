/**
 * Pairing algorithms
 *
 * This file documents the rules governing how players are paired each round,
 * how colors (white/black) are assigned, and how byes are allocated.
 *
 * Three formats are supported:
 *   Swiss        — players are paired against opponents with similar scores
 *   Round Robin  — every player faces every other player exactly once
 *   Double RR    — every player faces every other player twice (once per color)
 */

import { describe, it, expect } from 'vitest'
import {
  recommendedRounds,
  generateRound1Pairings,
  generatePairings,
  generateRoundRobinPairings,
  type PairingPlayer,
} from './swiss'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function swissPlayer(
  id: string,
  seed: number,
  overrides: Partial<PairingPlayer> = {}
): PairingPlayer {
  return {
    id,
    seed,
    rating: null,
    score: 0,
    colorBalance: 0,
    lastColor: null,
    opponents: new Set(),
    hadBye: false,
    ...overrides,
  }
}

// ─── Recommended number of rounds ─────────────────────────────────────────────

describe('Recommended number of rounds', () => {
  describe('Swiss format', () => {
    it('uses ceil(log₂n) rounds — the minimum rounds needed to find a clear winner', () => {
      // 2  players → 1 round  (2¹ = 2)
      // 4  players → 2 rounds (2² = 4)
      // 8  players → 3 rounds (2³ = 8)
      // 16 players → 4 rounds (2⁴ = 16)
      // 5  players → 3 rounds (since 2² < 5 ≤ 2³)
      expect(recommendedRounds(2)).toBe(1)
      expect(recommendedRounds(4)).toBe(2)
      expect(recommendedRounds(8)).toBe(3)
      expect(recommendedRounds(16)).toBe(4)
      expect(recommendedRounds(5)).toBe(3)
      expect(recommendedRounds(9)).toBe(4)
    })

    it('returns 1 round for a field of fewer than 2 players', () => {
      expect(recommendedRounds(1)).toBe(1)
      expect(recommendedRounds(0)).toBe(1)
    })
  })

  describe('Single Round Robin format', () => {
    it('uses n−1 rounds for an even field, so every player faces every other exactly once', () => {
      expect(recommendedRounds(4, 'rr')).toBe(3)
      expect(recommendedRounds(6, 'rr')).toBe(5)
    })

    it('uses n rounds for an odd field — the extra round accommodates the rolling bye', () => {
      expect(recommendedRounds(5, 'rr')).toBe(5)
    })
  })

  describe('Double Round Robin format', () => {
    it('uses twice the single-RR round count so each player faces each opponent as both colors', () => {
      expect(recommendedRounds(4, 'drr')).toBe(6)  // 2 × (4−1)
      expect(recommendedRounds(5, 'drr')).toBe(10) // 2 × 5
      expect(recommendedRounds(6, 'drr')).toBe(10) // 2 × (6−1)
    })
  })
})

// ─── Round 1 Swiss pairings ────────────────────────────────────────────────────

describe('Round 1 Swiss pairings', () => {
  describe('Player ordering', () => {
    it('sorts by rating when at least one player has a rating, then pairs top-half against bottom-half', () => {
      // Sorted by rating: Alice(2400), Bob(2200), Carol(2000), Dave(1800)
      // Top half: [Alice, Bob]  Bottom half: [Carol, Dave]
      // Board 1: Alice vs Carol   Board 2: Dave vs Bob
      const players = [
        { id: 'Alice', rating: 2400, seed: 1 },
        { id: 'Bob',   rating: 2200, seed: 2 },
        { id: 'Carol', rating: 2000, seed: 3 },
        { id: 'Dave',  rating: 1800, seed: 4 },
      ]
      const pairings = generateRound1Pairings(players)

      expect(pairings).toHaveLength(2)
      expect(pairings[0]).toMatchObject({ type: 'game', whiteId: 'Alice', blackId: 'Carol' })
      expect(pairings[1]).toMatchObject({ type: 'game', whiteId: 'Dave',  blackId: 'Bob'   })
    })

    it('falls back to seed order when no player has a rating', () => {
      const players = [
        { id: 'P1', rating: null, seed: 1 },
        { id: 'P2', rating: null, seed: 2 },
        { id: 'P3', rating: null, seed: 3 },
        { id: 'P4', rating: null, seed: 4 },
      ]
      const pairings = generateRound1Pairings(players)

      expect(pairings[0]).toMatchObject({ type: 'game', whiteId: 'P1', blackId: 'P3' })
      expect(pairings[1]).toMatchObject({ type: 'game', whiteId: 'P4', blackId: 'P2' })
    })
  })

  describe('Color assignment', () => {
    it('alternates which half plays white across boards to avoid systematic color bias', () => {
      // Board 1 (even index): top-half player → white
      // Board 2 (odd index):  bottom-half player → white
      const players = [
        { id: 'Top1',    rating: 2400, seed: 1 },
        { id: 'Top2',    rating: 2200, seed: 2 },
        { id: 'Bottom1', rating: 2000, seed: 3 },
        { id: 'Bottom2', rating: 1800, seed: 4 },
      ]
      const pairings = generateRound1Pairings(players)
      const games = pairings.filter((p) => p.type === 'game') as Array<{ whiteId: string; blackId: string; type: 'game' }>

      // Board 1: top-seed plays white
      expect(games[0].whiteId).toBe('Top1')
      // Board 2: bottom-seed plays white
      expect(games[1].whiteId).toBe('Bottom2')
    })
  })

  describe('Bye allocation', () => {
    it('gives the bye to the lowest-rated player when the field has an odd number of players', () => {
      const players = [
        { id: 'Alice', rating: 2200, seed: 1 },
        { id: 'Bob',   rating: 2000, seed: 2 },
        { id: 'Carol', rating: 1800, seed: 3 }, // weakest → gets the bye
      ]
      const pairings = generateRound1Pairings(players)

      expect(pairings).toHaveLength(2)
      expect(pairings[0]).toMatchObject({ type: 'game', whiteId: 'Alice', blackId: 'Bob' })
      expect(pairings[1]).toEqual({ type: 'bye', playerId: 'Carol' })
    })

    it('appends the bye entry at the end so it does not occupy a board number', () => {
      const players = [
        { id: 'P1', rating: null, seed: 1 },
        { id: 'P2', rating: null, seed: 2 },
        { id: 'P3', rating: null, seed: 3 },
      ]
      const pairings = generateRound1Pairings(players)

      expect(pairings[pairings.length - 1].type).toBe('bye')
    })

    it('produces no bye when the field has an even number of players', () => {
      const players = [
        { id: 'A', rating: 2000, seed: 1 },
        { id: 'B', rating: 1800, seed: 2 },
      ]
      const pairings = generateRound1Pairings(players)

      expect(pairings).toHaveLength(1)
      expect(pairings[0].type).toBe('game')
    })
  })
})

// ─── Subsequent round Swiss pairings ──────────────────────────────────────────

describe('Subsequent round Swiss pairings', () => {
  describe('Score grouping', () => {
    it('pairs players with the same score against each other, highest score groups first', () => {
      // Score group 2: [P1, P2]   Score group 0: [P3, P4]
      const players = [
        swissPlayer('P1', 1, { score: 2 }),
        swissPlayer('P2', 2, { score: 2 }),
        swissPlayer('P3', 3, { score: 0 }),
        swissPlayer('P4', 4, { score: 0 }),
      ]
      const pairings = generatePairings(players)
      const matchUps = pairings
        .filter((p) => p.type === 'game')
        .map((p) => [( p as any).whiteId, (p as any).blackId].sort().join(' vs '))

      expect(matchUps).toContain('P1 vs P2')
      expect(matchUps).toContain('P3 vs P4')
    })
  })

  describe('Rematch avoidance', () => {
    it('never pairs two players who have already played each other, even when they share the same score', () => {
      // P1 and P2 already played; they should not be paired again
      const players = [
        swissPlayer('P1', 1, { score: 1, opponents: new Set(['P2']) }),
        swissPlayer('P2', 2, { score: 1, opponents: new Set(['P1']) }),
        swissPlayer('P3', 3, { score: 1 }),
        swissPlayer('P4', 4, { score: 1 }),
      ]
      const pairings = generatePairings(players)
      const games = pairings.filter((p) => p.type === 'game') as Array<{ type: 'game'; whiteId: string; blackId: string }>

      for (const { whiteId, blackId } of games) {
        const matchUp = [whiteId, blackId].sort().join(' vs ')
        expect(matchUp).not.toBe('P1 vs P2')
      }
    })

    it('allows a rematch as a last resort when no other pairing is possible', () => {
      // Only two players remain; they must play each other again
      const players = [
        swissPlayer('P1', 1, { score: 1, opponents: new Set(['P2']) }),
        swissPlayer('P2', 2, { score: 1, opponents: new Set(['P1']) }),
      ]
      const pairings = generatePairings(players)
      const games = pairings.filter((p) => p.type === 'game')

      // The pairing is made despite the previous encounter
      expect(games).toHaveLength(1)
    })
  })

  describe('Color assignment', () => {
    it('gives white to the player with the lower color balance (i.e. who has played black more)', () => {
      // P1 has colorBalance −1 (played black more), P2 has +1 (played white more)
      // → P1 should get white this round
      const players = [
        swissPlayer('P1', 1, { score: 1, colorBalance: -1 }),
        swissPlayer('P2', 2, { score: 1, colorBalance:  1 }),
      ]
      const pairings = generatePairings(players)

      expect(pairings[0]).toMatchObject({ type: 'game', whiteId: 'P1', blackId: 'P2' })
    })

    it('when color balances are equal, gives white to the player whose last color was black', () => {
      const players = [
        swissPlayer('P1', 1, { score: 1, lastColor: 'black' }),
        swissPlayer('P2', 2, { score: 1, lastColor: 'white' }),
      ]
      const pairings = generatePairings(players)

      expect(pairings[0]).toMatchObject({ type: 'game', whiteId: 'P1', blackId: 'P2' })
    })
  })

  describe('Bye allocation', () => {
    it('gives the bye to the lowest-ranked player who has not yet received a bye', () => {
      // P3 is lowest-ranked and has not had a bye — they should receive it
      const players = [
        swissPlayer('P1', 1, { score: 2 }),
        swissPlayer('P2', 2, { score: 1 }),
        swissPlayer('P3', 3, { score: 0, hadBye: false }),
      ]
      const pairings = generatePairings(players)
      const bye = pairings.find((p) => p.type === 'bye')

      expect(bye).toEqual({ type: 'bye', playerId: 'P3' })
    })

    it('skips players who already had a bye and promotes the bye to the next eligible player', () => {
      // P2 and P3 already had byes; P1 (highest-ranked) is the only one without
      const players = [
        swissPlayer('P1', 1, { score: 2, hadBye: false }),
        swissPlayer('P2', 2, { score: 1, hadBye: true  }),
        swissPlayer('P3', 3, { score: 0, hadBye: true  }),
      ]
      const pairings = generatePairings(players)
      const bye = pairings.find((p) => p.type === 'bye')

      expect(bye).toEqual({ type: 'bye', playerId: 'P1' })
    })

    it('appends the bye entry at the end of the pairing list', () => {
      const players = [
        swissPlayer('P1', 1, { score: 1 }),
        swissPlayer('P2', 2, { score: 1 }),
        swissPlayer('P3', 3, { score: 0 }),
      ]
      const pairings = generatePairings(players)

      expect(pairings[pairings.length - 1].type).toBe('bye')
    })
  })

  it('returns an empty list when there are no players to pair', () => {
    expect(generatePairings([])).toEqual([])
  })
})

// ─── Round Robin pairings (circle method) ────────────────────────────────────

describe('Round Robin pairings (circle method)', () => {
  // The circle method fixes the first player and rotates everyone else.
  // This guarantees that every player meets every other player exactly once
  // across all rounds.

  const fourPlayers = [
    { id: 'P1', seed: 1 },
    { id: 'P2', seed: 2 },
    { id: 'P3', seed: 3 },
    { id: 'P4', seed: 4 },
  ]

  describe('Single Round Robin with 4 players (3 rounds)', () => {
    it('round 1: pairs the fixed top seed against the bottom seed, and the middle two against each other', () => {
      // Initial order: [P1, P2, P3, P4]
      // P1 (fixed) vs P4; P2 vs P3
      const pairings = generateRoundRobinPairings(fourPlayers, 1)

      expect(pairings).toHaveLength(2)
      expect(pairings[0]).toEqual({ type: 'game', whiteId: 'P1', blackId: 'P4' })
      expect(pairings[1]).toEqual({ type: 'game', whiteId: 'P2', blackId: 'P3' })
    })

    it('round 2: rotates the non-fixed players by one position', () => {
      // Rotated order: [P1, P3, P4, P2]
      // P1 (fixed) vs P2; P3 vs P4
      const pairings = generateRoundRobinPairings(fourPlayers, 2)

      expect(pairings[0]).toEqual({ type: 'game', whiteId: 'P1', blackId: 'P2' })
      expect(pairings[1]).toEqual({ type: 'game', whiteId: 'P3', blackId: 'P4' })
    })

    it('ensures every player faces every other player exactly once across all 3 rounds', () => {
      // 4 players → C(4,2) = 6 unique match-ups
      const allMatchUps = new Set<string>()
      for (let round = 1; round <= 3; round++) {
        for (const pairing of generateRoundRobinPairings(fourPlayers, round)) {
          if (pairing.type === 'game') {
            allMatchUps.add([pairing.whiteId, pairing.blackId].sort().join(' vs '))
          }
        }
      }
      expect(allMatchUps.size).toBe(6)
    })
  })

  describe('Double Round Robin with 4 players (6 rounds)', () => {
    it('plays the same schedule twice — the second half reverses colors so each player gets both sides', () => {
      const firstHalfRound1  = generateRoundRobinPairings(fourPlayers, 1, true)
      const secondHalfRound1 = generateRoundRobinPairings(fourPlayers, 4, true) // mirrors round 1

      expect(secondHalfRound1).toHaveLength(firstHalfRound1.length)
      for (let i = 0; i < firstHalfRound1.length; i++) {
        const first  = firstHalfRound1[i]  as { type: 'game'; whiteId: string; blackId: string }
        const second = secondHalfRound1[i] as { type: 'game'; whiteId: string; blackId: string }
        expect(second.whiteId).toBe(first.blackId)
        expect(second.blackId).toBe(first.whiteId)
      }
    })

    it('ensures every player faces every other player as both white and black across 6 rounds', () => {
      // 4 players → 4×3 = 12 directed match-ups
      const directedMatchUps = new Set<string>()
      for (let round = 1; round <= 6; round++) {
        for (const pairing of generateRoundRobinPairings(fourPlayers, round, true)) {
          if (pairing.type === 'game') {
            directedMatchUps.add(`${pairing.whiteId} (white) vs ${pairing.blackId} (black)`)
          }
        }
      }
      expect(directedMatchUps.size).toBe(12)
    })
  })

  describe('Odd number of players', () => {
    it('introduces a ghost player to pad to an even field, so exactly one player sits out each round', () => {
      const threePlayers = [
        { id: 'P1', seed: 1 },
        { id: 'P2', seed: 2 },
        { id: 'P3', seed: 3 },
      ]
      let totalByes = 0
      for (let round = 1; round <= 3; round++) {
        const byes = generateRoundRobinPairings(threePlayers, round).filter((p) => p.type === 'bye')
        expect(byes).toHaveLength(1) // exactly one bye per round
        totalByes += byes.length
      }
      expect(totalByes).toBe(3) // one bye per round × 3 rounds
    })

    it('still ensures every player faces every other player exactly once across all rounds', () => {
      const threePlayers = [
        { id: 'P1', seed: 1 },
        { id: 'P2', seed: 2 },
        { id: 'P3', seed: 3 },
      ]
      // C(3,2) = 3 unique match-ups
      const allMatchUps = new Set<string>()
      for (let round = 1; round <= 3; round++) {
        for (const pairing of generateRoundRobinPairings(threePlayers, round)) {
          if (pairing.type === 'game') {
            allMatchUps.add([pairing.whiteId, pairing.blackId].sort().join(' vs '))
          }
        }
      }
      expect(allMatchUps.size).toBe(3)
    })
  })
})

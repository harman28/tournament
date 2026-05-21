/**
 * Standings, scoring, and player state
 *
 * This file documents how the tournament computes scores after each game,
 * how Buchholz tiebreaks are calculated, how players are ranked, and how
 * the pairing engine tracks player state between rounds.
 *
 * Scoring summary:
 *   Win  → 1 point   Loss → 0 points   Draw → 0.5 points each
 *   Bye  → 1 point (counts as a win, but not as a played game)
 */

import { describe, it, expect } from 'vitest'
import { computeStandings, buildPlayerStates } from './standings'

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Minimal player object — standings only needs id, seed, and rating at runtime.
// The Prisma Player type is imported as `type` only and stripped by the build.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const player = (name: string, seed: number, rating: number | null = null): any => ({
  id: name,
  name,
  seed,
  rating,
})

let gameCounter = 0
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const game = (opts: {
  white?: string
  black?: string
  bye?: string
  result?: string | null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}): any => ({
  id: `game-${++gameCounter}`,
  whitePlayerId: opts.white  ?? null,
  blackPlayerId: opts.black  ?? null,
  byePlayerId:   opts.bye    ?? null,
  result:        opts.result ?? null,
  pendingResult: null,
  pendingBy:     null,
  roundId:       'r1',
})

// ─── Scoring rules ────────────────────────────────────────────────────────────

describe('Scoring rules', () => {
  it('awards 1 point to the winner and 0 to the loser (white wins)', () => {
    const players = [player('Alice', 1), player('Bob', 2)]
    const games   = [game({ white: 'Alice', black: 'Bob', result: '1-0' })]

    const standings = computeStandings(players, games)
    const byName    = Object.fromEntries(standings.map((s) => [s.player.id, s]))

    expect(byName['Alice'].score).toBe(1)
    expect(byName['Alice'].wins).toBe(1)
    expect(byName['Bob'].score).toBe(0)
    expect(byName['Bob'].wins).toBe(0)
  })

  it('awards 1 point to the winner and 0 to the loser (black wins)', () => {
    const players = [player('Alice', 1), player('Bob', 2)]
    const games   = [game({ white: 'Alice', black: 'Bob', result: '0-1' })]

    const standings = computeStandings(players, games)
    const byName    = Object.fromEntries(standings.map((s) => [s.player.id, s]))

    expect(byName['Bob'].score).toBe(1)
    expect(byName['Alice'].score).toBe(0)
  })

  it('awards 0.5 points to each player in a drawn game', () => {
    const players = [player('Alice', 1), player('Bob', 2)]
    const games   = [game({ white: 'Alice', black: 'Bob', result: '1/2-1/2' })]

    const standings = computeStandings(players, games)
    const byName    = Object.fromEntries(standings.map((s) => [s.player.id, s]))

    expect(byName['Alice'].score).toBe(0.5)
    expect(byName['Bob'].score).toBe(0.5)
    // A draw is not counted as a win for either player
    expect(byName['Alice'].wins).toBe(0)
    expect(byName['Bob'].wins).toBe(0)
  })

  it('awards a full point for a bye, counted as a win', () => {
    const players = [player('Alice', 1)]
    const games   = [game({ bye: 'Alice', result: 'bye' })]

    const standings = computeStandings(players, games)
    const alice     = standings[0]

    expect(alice.score).toBe(1)
    expect(alice.wins).toBe(1)
  })

  it('does not count a bye as a played game (for Buchholz purposes)', () => {
    const players = [player('Alice', 1)]
    const games   = [game({ bye: 'Alice', result: 'bye' })]

    const standings = computeStandings(players, games)

    expect(standings[0].gamesPlayed).toBe(0)
  })

  it('ignores games that do not yet have a result', () => {
    const players = [player('Alice', 1), player('Bob', 2)]
    const games   = [game({ white: 'Alice', black: 'Bob', result: null })]

    const standings = computeStandings(players, games)

    expect(standings.every((s) => s.score === 0)).toBe(true)
  })

  it('counts only regular (non-bye) games in gamesPlayed', () => {
    const players = [player('Alice', 1), player('Bob', 2)]
    const games   = [
      game({ bye:   'Alice',               result: 'bye' }),
      game({ white: 'Alice', black: 'Bob', result: '1-0' }),
    ]

    const standings = computeStandings(players, games)
    const alice     = standings.find((s) => s.player.id === 'Alice')!

    expect(alice.score).toBe(2)
    expect(alice.gamesPlayed).toBe(1) // only the real game counts
  })
})

// ─── Buchholz tiebreaker ──────────────────────────────────────────────────────

describe('Buchholz tiebreaker', () => {
  it("equals the sum of all opponents' final scores", () => {
    // Round 1: Alice beats Bob.  Scores: Alice=1, Bob=0
    // Round 2: Bob beats Carol.  Scores: Bob=1,   Carol=0
    // Final totals: Alice=1, Bob=1, Carol=0
    //
    // Buchholz:
    //   Alice → played Bob (scored 1)               → buchholz = 1
    //   Bob   → played Alice (scored 1) + Carol (0) → buchholz = 1
    //   Carol → played Bob (scored 1)               → buchholz = 1
    const players = [player('Alice', 1), player('Bob', 2), player('Carol', 3)]
    const games   = [
      game({ white: 'Alice', black: 'Bob',   result: '1-0' }),
      game({ white: 'Bob',   black: 'Carol', result: '1-0' }),
    ]

    const standings = computeStandings(players, games)
    const byName    = Object.fromEntries(standings.map((s) => [s.player.id, s]))

    expect(byName['Alice'].buchholz).toBe(1)
    expect(byName['Bob'].buchholz).toBe(1)
    expect(byName['Carol'].buchholz).toBe(1)
  })

  it('does not include bye opponents in the Buchholz sum', () => {
    // Alice gets a bye (score=1) and then beats Bob (score=0).
    // Bob's buchholz = Alice's score = 2 (only the real game counts for Buchholz).
    // Alice's buchholz = Bob's score = 0 (bye does not create a Buchholz connection).
    const players = [player('Alice', 1), player('Bob', 2)]
    const games   = [
      game({ bye:   'Alice',               result: 'bye' }),
      game({ white: 'Alice', black: 'Bob', result: '1-0' }),
    ]

    const standings = computeStandings(players, games)
    const byName    = Object.fromEntries(standings.map((s) => [s.player.id, s]))

    expect(byName['Bob'].buchholz).toBe(2)   // Alice's total score
    expect(byName['Alice'].buchholz).toBe(0) // bye adds no Buchholz link
  })
})

// ─── Ranking order ────────────────────────────────────────────────────────────

describe('Ranking order', () => {
  it('ranks players by score (descending) as the primary criterion', () => {
    const players = [player('Alice', 1), player('Bob', 2), player('Carol', 3)]
    const games   = [
      game({ white: 'Alice', black: 'Bob',   result: '1-0' }),
      game({ white: 'Alice', black: 'Carol', result: '1-0' }),
    ]

    const standings = computeStandings(players, games)

    expect(standings[0].player.id).toBe('Alice') // 2 points
    // Bob and Carol both have 0 points; their relative order is by seed
  })

  it('uses Buchholz as the tiebreaker when two players have the same score', () => {
    // Dave (a strong player) beats Carol first, giving Carol a score of 0.
    // Alice then beats Dave → Alice's Buchholz = Dave's final score of 1.
    // Bob beats Carol directly → Bob's Buchholz = Carol's final score of 0.
    // Both Alice and Bob end on 1 point; Alice's higher Buchholz puts her ahead.
    const players = [player('Alice', 1), player('Bob', 2), player('Carol', 3), player('Dave', 4)]
    const games   = [
      game({ white: 'Dave',  black: 'Carol', result: '1-0' }), // Carol = weak opp (0pt)
      game({ white: 'Alice', black: 'Dave',  result: '1-0' }), // Alice beats the strong opp
      game({ white: 'Bob',   black: 'Carol', result: '1-0' }), // Bob beats the weak opp
    ]

    const standings = computeStandings(players, games)
    const byName    = Object.fromEntries(standings.map((s) => [s.player.id, s]))

    // Verify the Buchholz values match the reasoning above
    expect(byName['Alice'].buchholz).toBe(1) // Dave's final score
    expect(byName['Bob'].buchholz).toBe(0)   // Carol's final score

    // Alice and Bob are both on 1pt — Alice ranks higher due to Buchholz
    expect(standings.findIndex((s) => s.player.id === 'Alice')).toBeLessThan(
      standings.findIndex((s) => s.player.id === 'Bob')
    )
  })

  it('uses wins as the third tiebreaker when score and Buchholz are equal', () => {
    // Alice and Bob both score 1pt but Alice has 1 win and Bob has 0 (two draws).
    // To make their Buchholz equal they must face the same pair of opponents.
    //   Alice beats Carol, then Dave beats Alice  → Alice: 1pt, 1 win
    //   Bob draws Carol, then Bob draws Dave       → Bob:   1pt, 0 wins
    // Carol.final = 0.5 (lost to Alice, drew Bob)
    // Dave.final  = 1.5 (beat Alice, drew Bob)
    // Both: Buchholz = Carol.final + Dave.final = 0.5 + 1.5 = 2  ← equal
    // Alice ranks ahead because wins (1) > wins (0).
    const players = [player('Alice', 1), player('Bob', 2), player('Carol', 3), player('Dave', 4)]
    const games   = [
      game({ white: 'Alice', black: 'Carol', result: '1-0'     }), // Alice beats Carol
      game({ white: 'Dave',  black: 'Alice', result: '1-0'     }), // Dave beats Alice
      game({ white: 'Bob',   black: 'Carol', result: '1/2-1/2' }), // Bob draws Carol
      game({ white: 'Dave',  black: 'Bob',   result: '1/2-1/2' }), // Dave draws Bob
    ]

    const standings = computeStandings(players, games)
    const byName    = Object.fromEntries(standings.map((s) => [s.player.id, s]))

    expect(byName['Alice'].score).toBe(1)
    expect(byName['Bob'].score).toBe(1)
    expect(byName['Alice'].buchholz).toBe(byName['Bob'].buchholz) // equal → wins decides
    expect(byName['Alice'].wins).toBe(1)
    expect(byName['Bob'].wins).toBe(0)
    expect(standings.findIndex((s) => s.player.id === 'Alice')).toBeLessThan(
      standings.findIndex((s) => s.player.id === 'Bob')
    )
  })

  it('uses seed as the final tiebreaker when score, Buchholz, and wins are all equal', () => {
    // Alice (seed 1) and Bob (seed 2) have identical records — Alice ranks first by seed
    const players = [player('Alice', 1), player('Bob', 2)]
    const games: ReturnType<typeof game>[] = [] // no games played; both at 0pts

    const standings = computeStandings(players, games)

    expect(standings[0].player.id).toBe('Alice')
    expect(standings[1].player.id).toBe('Bob')
  })

  it('assigns the same rank to players who are completely tied (score, Buchholz, and wins all equal)', () => {
    // Alice and Bob both have 0pts, 0 Buchholz, 0 wins — they share rank 1
    const players = [player('Alice', 1), player('Bob', 2)]
    const games: ReturnType<typeof game>[] = []

    const standings = computeStandings(players, games)

    expect(standings[0].rank).toBe(1)
    expect(standings[1].rank).toBe(1)
  })

  it('does not assign shared ranks when Buchholz differs, even if scores are equal', () => {
    // Carol beats a strong opponent (Alice, who scored 1) → carol.buchholz = 1
    // Dave beats a weak opponent (Bob, who scored 0) → dave.buchholz = 0
    // Carol and Dave both end on 1pt but get different ranks because their Buchholz differs.
    const players = [player('Alice', 1), player('Bob', 2), player('Carol', 3), player('Dave', 4)]
    const games   = [
      game({ white: 'Alice', black: 'Bob',   result: '1-0' }), // Alice=1pt, Bob=0pt
      game({ white: 'Carol', black: 'Alice', result: '1-0' }), // Carol beats strong opponent
      game({ white: 'Dave',  black: 'Bob',   result: '1-0' }), // Dave beats weak opponent
    ]

    const standings = computeStandings(players, games)
    const byName    = Object.fromEntries(standings.map((s) => [s.player.id, s]))

    expect(byName['Carol'].buchholz).toBe(1) // faced Alice who scored 1
    expect(byName['Dave'].buchholz).toBe(0)  // faced Bob who scored 0
    expect(byName['Carol'].rank).not.toBe(byName['Dave'].rank)
  })

  it('skips rank numbers after a tie so the next distinct player gets the correct position', () => {
    // Alice and Bob both beat Carol with identical results → tied on score, Buchholz, and wins.
    // They share rank 1. Carol is the 3rd-place player and should receive rank 3, not rank 2
    // (rank 2 is skipped because two players occupy the first position).
    const players = [player('Alice', 1), player('Bob', 2), player('Carol', 3)]
    const games   = [
      game({ white: 'Alice', black: 'Carol', result: '1-0' }),
      game({ white: 'Bob',   black: 'Carol', result: '1-0' }),
    ]

    const standings = computeStandings(players, games)

    expect(standings[0].player.id).toBe('Alice')
    expect(standings[0].rank).toBe(1)
    expect(standings[1].player.id).toBe('Bob')
    expect(standings[1].rank).toBe(1)   // tied with Alice → same rank
    expect(standings[2].player.id).toBe('Carol')
    expect(standings[2].rank).toBe(3)   // rank 2 is skipped; Carol is genuinely 3rd
  })
})

// ─── Player state for Swiss pairing ───────────────────────────────────────────

describe('Player state for Swiss pairing (buildPlayerStates)', () => {
  // Between rounds, the pairing engine needs to know each player's current
  // score, color history, and who they have already faced. This data is
  // reconstructed from the game history each time a new round is generated.

  it('starts every player at zero score with no opponents and no color history', () => {
    const players = [player('Alice', 1), player('Bob', 2)]
    const states  = buildPlayerStates(players, [])

    for (const state of states) {
      expect(state.score).toBe(0)
      expect(state.opponents.size).toBe(0)
      expect(state.colorBalance).toBe(0)
      expect(state.lastColor).toBeNull()
      expect(state.hadBye).toBe(false)
    }
  })

  it('correctly accumulates scores across multiple games', () => {
    // Alice: 1 win + 1 draw = 1.5pts.  Bob: 1 loss + 1 draw = 0.5pts.
    const players = [player('Alice', 1), player('Bob', 2), player('Carol', 3)]
    const games   = [
      game({ white: 'Alice', black: 'Bob',   result: '1-0'     }),
      game({ white: 'Alice', black: 'Carol', result: '1/2-1/2' }),
    ]

    const states = buildPlayerStates(players, games)
    const byName = Object.fromEntries(states.map((s) => [s.id, s]))

    expect(byName['Alice'].score).toBe(1.5)
    expect(byName['Bob'].score).toBe(0)
    expect(byName['Carol'].score).toBe(0.5)
  })

  it('records both players as opponents of each other after a game', () => {
    const players = [player('Alice', 1), player('Bob', 2)]
    const games   = [game({ white: 'Alice', black: 'Bob', result: '1-0' })]

    const states = buildPlayerStates(players, games)
    const byName = Object.fromEntries(states.map((s) => [s.id, s]))

    expect(byName['Alice'].opponents.has('Bob')).toBe(true)
    expect(byName['Bob'].opponents.has('Alice')).toBe(true)
  })

  it('tracks color balance: +1 per game as white, −1 per game as black', () => {
    // Alice played white → colorBalance +1.  Bob played black → colorBalance −1.
    const players = [player('Alice', 1), player('Bob', 2)]
    const games   = [game({ white: 'Alice', black: 'Bob', result: '1-0' })]

    const states = buildPlayerStates(players, games)
    const byName = Object.fromEntries(states.map((s) => [s.id, s]))

    expect(byName['Alice'].colorBalance).toBe(1)
    expect(byName['Alice'].lastColor).toBe('white')
    expect(byName['Bob'].colorBalance).toBe(-1)
    expect(byName['Bob'].lastColor).toBe('black')
  })

  it('grants 1 point for a bye and marks hadBye = true, without affecting color history', () => {
    const players = [player('Alice', 1), player('Bob', 2)]
    const games   = [game({ bye: 'Alice', result: 'bye' })]

    const states = buildPlayerStates(players, games)
    const byName = Object.fromEntries(states.map((s) => [s.id, s]))

    expect(byName['Alice'].score).toBe(1)
    expect(byName['Alice'].hadBye).toBe(true)
    expect(byName['Alice'].colorBalance).toBe(0) // bye does not affect color balance
    expect(byName['Alice'].lastColor).toBeNull()

    expect(byName['Bob'].hadBye).toBe(false)
  })

  it('ignores games that have not yet been played (no result)', () => {
    const players = [player('Alice', 1), player('Bob', 2)]
    const games   = [game({ white: 'Alice', black: 'Bob', result: null })]

    const states = buildPlayerStates(players, games)
    const byName = Object.fromEntries(states.map((s) => [s.id, s]))

    expect(byName['Alice'].score).toBe(0)
    expect(byName['Alice'].opponents.size).toBe(0)
    expect(byName['Alice'].colorBalance).toBe(0)
  })

  it('preserves the player rating and seed so the pairing engine can use them', () => {
    const players = [{ id: 'Alice', name: 'Alice', seed: 3, rating: 2100 }]
    const states  = buildPlayerStates(players as any, [])

    expect(states[0].rating).toBe(2100)
    expect(states[0].seed).toBe(3)
  })
})

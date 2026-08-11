export function recommendedRounds(playerCount: number, format: string = 'swiss'): number {
  if (format === 'drr') return 2 * Math.max(1, playerCount % 2 === 0 ? playerCount - 1 : playerCount)
  if (format === 'rr')  return Math.max(1, playerCount % 2 === 0 ? playerCount - 1 : playerCount)
  if (playerCount < 2) return 1
  return Math.ceil(Math.log2(playerCount))
}

export type PairingPlayer = {
  id: string
  rating: number | null
  seed: number
  score: number
  colorBalance: number
  lastColor: 'white' | 'black' | null
  // How many rounds in a row (most recent streak) lastColor has held. Needed
  // on top of lastColor alone to break a colorBalance tie between two
  // players who *both* just had the same color - see assignColors.
  colorStreak: number
  opponents: Set<string>
  hadBye: boolean
}

export type Pairing =
  | { type: 'game'; whiteId: string; blackId: string }
  | { type: 'bye'; playerId: string }

export type NumberedPairing = Pairing & { boardNumber: number | null }

/**
 * Assigns display board numbers to a round's pairings, honoring players'
 * pinned "fixedBoard" preference (for streamers whose equipment can't move).
 * A fixed player's game always lands on their board number; everything else
 * fills the remaining numbers in order, starting from 1.
 *
 * If two different games each have a fixed-board player wanting the SAME
 * number, the earlier pairing (by array order) keeps it and the other falls
 * back to the next available number - a rare, unresolvable clash, not
 * something we block on.
 *
 * If a fixed player's own game has BOTH players pinned to different boards
 * (i.e. two streamers paired against each other), the lower of the two
 * numbers wins for that single shared game.
 */
export function assignBoardNumbers(
  pairings: Pairing[],
  players: Array<{ id: string; fixedBoard: number | null }>
): NumberedPairing[] {
  const fixedById = new Map(
    players.filter((p) => p.fixedBoard != null).map((p) => [p.id, p.fixedBoard as number])
  )

  const desired = new Map<number, number>()
  pairings.forEach((p, i) => {
    if (p.type !== 'game') return
    const whiteFixed = fixedById.get(p.whiteId)
    const blackFixed = fixedById.get(p.blackId)
    if (whiteFixed != null && blackFixed != null) desired.set(i, Math.min(whiteFixed, blackFixed))
    else if (whiteFixed != null) desired.set(i, whiteFixed)
    else if (blackFixed != null) desired.set(i, blackFixed)
  })

  const used = new Set<number>()
  const finalBoard = new Map<number, number>()
  pairings.forEach((_, i) => {
    const want = desired.get(i)
    if (want != null && !used.has(want)) {
      finalBoard.set(i, want)
      used.add(want)
    }
  })

  let next = 1
  function takeNextAvailable(): number {
    while (used.has(next)) next++
    used.add(next)
    return next++
  }

  return pairings.map((p, i) => {
    if (p.type === 'bye') return { ...p, boardNumber: null }
    return { ...p, boardNumber: finalBoard.get(i) ?? takeNextAvailable() }
  })
}

// ── Swiss pairing ─────────────────────────────────────────────────────────────

export function generateRound1Pairings(
  players: Array<{ id: string; rating: number | null; seed: number }>
): Pairing[] {
  const hasRatings = players.some((p) => p.rating != null)
  const sorted = hasRatings
    ? [...players].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    : [...players].sort((a, b) => a.seed - b.seed)

  const results: Pairing[] = []
  let list = [...sorted]

  // Bye goes to LAST player (lowest seed / rating) — added at end
  let byePlayer: (typeof sorted)[0] | null = null
  if (list.length % 2 !== 0) {
    byePlayer = list[list.length - 1]
    list = list.slice(0, list.length - 1)
  }

  const half = list.length / 2
  for (let i = 0; i < half; i++) {
    results.push({
      type: 'game',
      whiteId: i % 2 === 0 ? list[i].id : list[half + i].id,
      blackId: i % 2 === 0 ? list[half + i].id : list[i].id,
    })
  }

  // Bye appended last so it sorts to the bottom
  if (byePlayer) results.push({ type: 'bye', playerId: byePlayer.id })
  return results
}

export function generatePairings(players: PairingPlayer[]): Pairing[] {
  if (players.length === 0) return []

  const sorted = [...players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.seed - b.seed
  })

  const paired = new Set<string>()
  const results: Pairing[] = []
  let byePlayer: PairingPlayer | null = null

  // Bye goes to the lowest-ranked player without a prior bye — will be
  // appended at end. Among those eligible, skip anyone who hasn't played a
  // single game yet (opponents.size === 0, never had a bye either) if a
  // more experienced candidate is available: a brand-new entrant (someone
  // added mid-tournament - see players/route.ts) sorts to the very bottom
  // on a fresh 0 score, so without this they'd draw a bye as their first
  // "round" ever, which defeats the point of joining. Only fall back to a
  // never-played candidate if literally everyone eligible is in that boat
  // (e.g. several late joiners at once with an odd total).
  if (sorted.length % 2 !== 0) {
    let fallback: PairingPlayer | null = null
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].hadBye) continue
      if (fallback === null) fallback = sorted[i]
      if (sorted[i].opponents.size > 0) { byePlayer = sorted[i]; break }
    }
    if (!byePlayer) byePlayer = fallback ?? sorted[sorted.length - 1]
    paired.add(byePlayer.id)
  }

  for (let i = 0; i < sorted.length; i++) {
    if (paired.has(sorted[i].id)) continue
    let opponentIdx = -1
    for (let j = i + 1; j < sorted.length; j++) {
      if (paired.has(sorted[j].id)) continue
      if (!sorted[i].opponents.has(sorted[j].id)) { opponentIdx = j; break }
    }
    if (opponentIdx === -1) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (!paired.has(sorted[j].id)) { opponentIdx = j; break }
      }
    }
    if (opponentIdx === -1) continue

    const p1 = sorted[i]
    const p2 = sorted[opponentIdx]
    const { white, black } = assignColors(p1, p2)
    results.push({ type: 'game', whiteId: white.id, blackId: black.id })
    paired.add(p1.id)
    paired.add(p2.id)
  }

  // Bye appended last
  if (byePlayer) results.push({ type: 'bye', playerId: byePlayer.id })
  return results
}

// Positive → this player is "due" for white (been on black, and the longer
// the black streak the more due); negative → giving them white would extend
// an existing white streak (worse the longer that streak already is).
function dueForWhite(p: PairingPlayer): number {
  if (p.lastColor === 'black') return p.colorStreak
  if (p.lastColor === 'white') return -p.colorStreak
  return 0
}

function assignColors(p1: PairingPlayer, p2: PairingPlayer) {
  if (p1.colorBalance < p2.colorBalance) return { white: p1, black: p2 }
  if (p2.colorBalance < p1.colorBalance) return { white: p2, black: p1 }
  // Equal balance - prefer whoever is more "due" for white based on their
  // current same-color streak, so nobody keeps landing the same color round
  // after round on ties. colorStreak (not just lastColor) matters here: two
  // players tied on balance who *both* just had white (e.g. each won as
  // white last round, against different opponents, and now happen to be
  // paired against each other) can't be told apart by lastColor alone -
  // the old fix only compared "did p1 have white, did p2 have white" and
  // fell through to always favoring p1 (whoever sorts first by score/seed -
  // in practice the tournament's own top player) whenever both sides
  // matched. Tracking the streak length breaks that tie correctly, and
  // guarantees it self-corrects within one round even in the worst case:
  // whichever of them gets white extends to streak+1, but the very next
  // time they're tied against *anyone*, their now-larger streak makes them
  // the *least* due for white, handing it to the other side before a real
  // 3-in-a-row can happen.
  const d1 = dueForWhite(p1)
  const d2 = dueForWhite(p2)
  if (d1 > d2) return { white: p1, black: p2 }
  if (d2 > d1) return { white: p2, black: p1 }
  return { white: p1, black: p2 }
}

// ── Round Robin pairing (circle method) ───────────────────────────────────────

export function generateRoundRobinPairings(
  players: Array<{ id: string; seed: number }>,
  roundNumber: number,
  isDouble: boolean = false
): Pairing[] {
  const sorted = [...players].sort((a, b) => a.seed - b.seed)
  const hasOdd = sorted.length % 2 !== 0

  // Effective size (pad with null = bye if odd)
  const list: (typeof sorted[0] | null)[] = [...sorted]
  if (hasOdd) list.push(null)
  const m = list.length

  const halfRounds = m - 1

  // For double RR: second half mirrors first half with reversed colors
  let effectiveRound = roundNumber
  let reverseColors = false
  if (isDouble && roundNumber > halfRounds) {
    effectiveRound = roundNumber - halfRounds
    reverseColors = true
  }

  // Circle method: fix list[0], rotate the rest by (effectiveRound - 1)
  const fixed = list[0]
  const rotating = list.slice(1)
  const shift = (effectiveRound - 1) % (m - 1)
  const rotated = [...rotating.slice(shift), ...rotating.slice(0, shift)]
  const full = [fixed, ...rotated]

  const pairings: Pairing[] = []

  for (let i = 0; i < m / 2; i++) {
    const a = full[i]
    const b = full[m - 1 - i]
    if (a === null) {
      if (b) pairings.push({ type: 'bye', playerId: b.id })
    } else if (b === null) {
      pairings.push({ type: 'bye', playerId: a.id })
    } else {
      pairings.push({
        type: 'game',
        whiteId: reverseColors ? b.id : a.id,
        blackId: reverseColors ? a.id : b.id,
      })
    }
  }

  return pairings
}

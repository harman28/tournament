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

  // Bye goes to lowest-ranked without a prior bye — will be appended at end
  if (sorted.length % 2 !== 0) {
    byePlayer = sorted[sorted.length - 1]
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (!sorted[i].hadBye) { byePlayer = sorted[i]; break }
    }
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

function assignColors(p1: PairingPlayer, p2: PairingPlayer) {
  if (p1.colorBalance < p2.colorBalance) return { white: p1, black: p2 }
  if (p2.colorBalance < p1.colorBalance) return { white: p2, black: p1 }
  if (p1.lastColor === 'black') return { white: p1, black: p2 }
  if (p2.lastColor === 'black') return { white: p2, black: p1 }
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

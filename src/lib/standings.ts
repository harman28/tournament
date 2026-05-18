import type { Player, Game } from '@prisma/client'

export type Standing = {
  player: Player
  score: number
  buchholz: number
  wins: number
  gamesPlayed: number
  rank: number
}

export function computeStandings(players: Player[], games: Game[]): Standing[] {
  const scores: Record<string, number> = {}
  const wins: Record<string, number> = {}
  const gamesPlayed: Record<string, number> = {}

  for (const p of players) {
    scores[p.id] = 0
    wins[p.id] = 0
    gamesPlayed[p.id] = 0
  }

  for (const game of games) {
    if (!game.result) continue

    if (game.byePlayerId) {
      scores[game.byePlayerId] = (scores[game.byePlayerId] ?? 0) + 1
      wins[game.byePlayerId] = (wins[game.byePlayerId] ?? 0) + 1
      // byes don't count toward gamesPlayed for Buchholz purposes
      continue
    }

    if (!game.whitePlayerId || !game.blackPlayerId) continue
    gamesPlayed[game.whitePlayerId] = (gamesPlayed[game.whitePlayerId] ?? 0) + 1
    gamesPlayed[game.blackPlayerId] = (gamesPlayed[game.blackPlayerId] ?? 0) + 1

    if (game.result === '1-0') {
      scores[game.whitePlayerId] = (scores[game.whitePlayerId] ?? 0) + 1
      wins[game.whitePlayerId] = (wins[game.whitePlayerId] ?? 0) + 1
    } else if (game.result === '0-1') {
      scores[game.blackPlayerId] = (scores[game.blackPlayerId] ?? 0) + 1
      wins[game.blackPlayerId] = (wins[game.blackPlayerId] ?? 0) + 1
    } else if (game.result === '1/2-1/2') {
      scores[game.whitePlayerId] = (scores[game.whitePlayerId] ?? 0) + 0.5
      scores[game.blackPlayerId] = (scores[game.blackPlayerId] ?? 0) + 0.5
    }
  }

  // Buchholz = sum of opponents' scores
  const buchholz: Record<string, number> = {}
  for (const p of players) buchholz[p.id] = 0

  for (const game of games) {
    if (!game.result || game.byePlayerId) continue
    if (!game.whitePlayerId || !game.blackPlayerId) continue

    buchholz[game.whitePlayerId] =
      (buchholz[game.whitePlayerId] ?? 0) + (scores[game.blackPlayerId] ?? 0)
    buchholz[game.blackPlayerId] =
      (buchholz[game.blackPlayerId] ?? 0) + (scores[game.whitePlayerId] ?? 0)
  }

  const unsorted: Omit<Standing, 'rank'>[] = players.map((p) => ({
    player: p,
    score: scores[p.id] ?? 0,
    buchholz: buchholz[p.id] ?? 0,
    wins: wins[p.id] ?? 0,
    gamesPlayed: gamesPlayed[p.id] ?? 0,
  }))

  unsorted.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz
    if (b.wins !== a.wins) return b.wins - a.wins
    return a.player.seed - b.player.seed
  })

  // Assign shared ranks: tied players share the same rank
  const standings: Standing[] = unsorted.map((s, i) => {
    let rank = i + 1
    if (i > 0) {
      const prev = unsorted[i - 1]
      if (s.score === prev.score && s.buchholz === prev.buchholz && s.wins === prev.wins) {
        rank = standings[i - 1].rank
      }
    }
    return { ...s, rank }
  })

  return standings
}

// Build player state needed for Swiss pairing from history
export function buildPlayerStates(
  players: Player[],
  games: Game[]
): import('./swiss').PairingPlayer[] {
  const scores: Record<string, number> = {}
  const colorBalance: Record<string, number> = {}
  const lastColor: Record<string, 'white' | 'black'> = {}
  const opponents: Record<string, Set<string>> = {}
  const hadBye: Record<string, boolean> = {}

  for (const p of players) {
    scores[p.id] = 0
    colorBalance[p.id] = 0
    opponents[p.id] = new Set()
    hadBye[p.id] = false
  }

  // Sort games by round so lastColor is accurate
  for (const game of games) {
    if (!game.result) continue

    if (game.byePlayerId) {
      scores[game.byePlayerId] = (scores[game.byePlayerId] ?? 0) + 1
      hadBye[game.byePlayerId] = true
      continue
    }

    if (!game.whitePlayerId || !game.blackPlayerId) continue

    opponents[game.whitePlayerId]?.add(game.blackPlayerId)
    opponents[game.blackPlayerId]?.add(game.whitePlayerId)
    colorBalance[game.whitePlayerId] = (colorBalance[game.whitePlayerId] ?? 0) + 1
    colorBalance[game.blackPlayerId] = (colorBalance[game.blackPlayerId] ?? 0) - 1
    lastColor[game.whitePlayerId] = 'white'
    lastColor[game.blackPlayerId] = 'black'

    if (game.result === '1-0') {
      scores[game.whitePlayerId] = (scores[game.whitePlayerId] ?? 0) + 1
    } else if (game.result === '0-1') {
      scores[game.blackPlayerId] = (scores[game.blackPlayerId] ?? 0) + 1
    } else if (game.result === '1/2-1/2') {
      scores[game.whitePlayerId] = (scores[game.whitePlayerId] ?? 0) + 0.5
      scores[game.blackPlayerId] = (scores[game.blackPlayerId] ?? 0) + 0.5
    }
  }

  return players.map((p) => ({
    id: p.id,
    rating: p.rating,
    seed: p.seed,
    score: scores[p.id] ?? 0,
    colorBalance: colorBalance[p.id] ?? 0,
    lastColor: lastColor[p.id] ?? null,
    opponents: opponents[p.id] ?? new Set(),
    hadBye: hadBye[p.id] ?? false,
  }))
}

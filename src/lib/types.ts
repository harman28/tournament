export type TournamentPlayer = {
  id: string
  name: string
  rating: number | null
  seed: number
}

export type TournamentGame = {
  id: string
  white: TournamentPlayer | null
  black: TournamentPlayer | null
  byePlayer: TournamentPlayer | null
  result: string | null
  pendingResult: string | null
  pendingBy: string | null
}

export type TournamentRound = {
  id: string
  number: number
  status: string
  games: TournamentGame[]
}

export type StandingRow = {
  player: TournamentPlayer
  score: number
  buchholz: number
  wins: number
  gamesPlayed: number
  rank: number
}

export type TournamentData = {
  id: string
  adminToken: string
  name: string
  format: string
  numRounds: number
  status: string
  players: TournamentPlayer[]
  rounds: TournamentRound[]
}

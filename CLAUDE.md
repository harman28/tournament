@AGENTS.md

# Chess Tournament

A chess tournament management app supporting Swiss and Round Robin formats. Players get a shareable public link; the organiser holds a secret admin URL.

## Stack

- **Next.js 16** (App Router, Turbopack) — `params` in both pages and route handlers is a `Promise`, always `await` it
- **Prisma 7** — breaking changes: no `url` in schema datasource; URL lives in `prisma.config.ts` and is passed via `@prisma/adapter-pg` in `src/lib/prisma.ts`
- **PostgreSQL** on Railway
- **nanoid** for short tournament IDs (8 chars) and admin tokens (16 chars)

## Key files

| Path | Purpose |
|------|---------|
| `prisma/schema.prisma` | DB schema — Tournament, Player, Round, Game |
| `prisma.config.ts` | Prisma config (reads `DATABASE_URL` for migrations) |
| `src/lib/prisma.ts` | Singleton Prisma client via `PrismaPg` adapter |
| `src/lib/swiss.ts` | Pairing algorithms: Swiss (greedy + color balance) and Round Robin (circle method, single + double) |
| `src/lib/standings.ts` | `computeStandings()` — scores, Buchholz, shared ranks; `buildPlayerStates()` for Swiss re-pairing |
| `src/lib/types.ts` | Shared TypeScript types (`TournamentData`, `StandingRow`, etc.) |
| `src/app/page.tsx` | Tournament creation form |
| `src/app/t/[id]/page.tsx` | Public tournament view (server component) |
| `src/app/t/[id]/admin/[token]/page.tsx` | Admin view — validates token, redirects to public if wrong |
| `src/components/TournamentView.tsx` | Main client component — tabs, pairings, results, standings, modals |
| `src/app/api/tournaments/route.ts` | POST — create tournament |
| `src/app/api/tournaments/[id]/route.ts` | GET — fetch tournament data |
| `src/app/api/tournaments/[id]/start/route.ts` | POST — generate round 1, set status=active |
| `src/app/api/tournaments/[id]/next-round/route.ts` | POST — complete current round, generate next (or finish tournament) |
| `src/app/api/tournaments/[id]/games/[gameId]/result/route.ts` | POST (player → pending) / PATCH (admin → direct) |
| `src/app/api/tournaments/[id]/games/[gameId]/approve/route.ts` | POST — admin approves or rejects a pending result |

## Database

`DATABASE_URL` must be set in `.env` (never committed — gitignored via `.env*`).

To apply schema changes: `npx prisma db push`

## Design

Gold/black palette. All styles are inline (Tailwind custom colours were unreliable). Colour tokens are defined at the top of each file:

- `BG #09080a` — page background  
- `CARD #130f08` — card background  
- `BORDER #2e2610` — borders  
- `ACCENT #d4a853` — gold (primary)  
- `MUTED #7a6440` — secondary text  
- `TEXT #f8f0dd` — primary text  

## Known gotchas

- **Prisma 7 adapter**: `PrismaClient` must receive a `PrismaPg` adapter; the old `datasource url` field in schema is gone.
- **Standings self-reference bug** (fixed): `computeStandings` originally used `.map()` and referenced `standings[i-1]` inside the callback — TDZ error. Fixed with `reduce`.
- **Bye ordering**: byes must be appended *last* in all pairing functions so they appear at the bottom of the pairings table without a board number.
- **Games ordering**: Prisma queries on games use `orderBy: { id: 'asc' }` to prevent reordering when results are entered.
- **scoreStr half-point**: `0.5` renders as `½`, not `0½`.

## Formats

| Format | `format` value | Rounds |
|--------|---------------|--------|
| Swiss | `swiss` | `ceil(log2(n))` recommended, user-editable |
| Single Round Robin | `rr` | `n-1` (even) or `n` (odd), fixed |
| Double Round Robin | `drr` | `2*(n-1)` or `2*n`, fixed |

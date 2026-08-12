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
| `src/app/t/[id]/page.tsx` | Public tournament view (server component); also `generateMetadata()` + `tournamentDescription()` for link-preview title/description |
| `src/app/t/[id]/opengraph-image.tsx` | Dynamic per-tournament WhatsApp/iMessage/Slack link-preview image (`next/og`) |
| `src/app/t/[id]/admin/[token]/page.tsx` | Admin view — validates token, redirects to public if wrong |
| `src/components/TournamentView.tsx` | Main client component — tabs, pairings, results, standings, modals |
| `src/app/api/tournaments/route.ts` | POST — create tournament |
| `src/app/api/tournaments/[id]/route.ts` | GET — fetch tournament data |
| `src/app/api/tournaments/[id]/start/route.ts` | POST — generate round 1, set status=active |
| `src/app/api/tournaments/[id]/next-round/route.ts` | POST — complete current round, generate next (or finish tournament) |
| `src/app/api/tournaments/[id]/games/[gameId]/result/route.ts` | POST (player → pending) / PATCH (admin → direct) |
| `src/app/api/tournaments/[id]/games/[gameId]/approve/route.ts` | POST — admin approves or rejects a pending result |
| `src/app/api/tournaments/[id]/players/route.ts` | POST — self-signup (no token, any format, only while "setup") or admin late-join (token required, Swiss only, only while "active") |
| `src/app/api/tournaments/[id]/players/[playerId]/route.ts` | PATCH — set fixed board (admin). DELETE — admin removes a player, only while "setup" |

## Database

`DATABASE_URL` must be set in `.env` (never committed — gitignored via `.env*`).

To apply schema changes: `npx prisma db push`

## Design

Gold/black palette. All styles are inline (Tailwind custom colours were unreliable), **except**
layout/positioning that needs a media query — inline `style` objects can't express those, so
`.modal-overlay`/`.modal-sheet` (`src/app/globals.css`) handle the one case that needs it:
result/add-player/join modals are a bottom sheet on mobile (thumb-reachable) but centered on
`min-width: 640px` (desktop mouse users shouldn't have to travel the full screen height to
reach a bottom sheet, especially when entering several results in a row). Colour/border/padding
etc. on those modals stay inline as usual; only the alignment/border-radius/animation switch
lives in the CSS class. Colour tokens are defined at the top of each file:

- `BG #09080a` — page background  
- `CARD #130f08` — card background  
- `BORDER #2e2610` — borders  
- `ACCENT #d4a853` — gold (primary)  
- `MUTED #7a6440` — secondary text  
- `TEXT #f8f0dd` — primary text  

## Known gotchas

- **Invite-link self-signup**: players are no longer required at creation time
  (`POST /api/tournaments` accepts an empty `players` array) — an organiser can create a
  tournament with zero pre-listed players and just share the invite link (the same URL as the
  public player link, `/t/[id]`). While a tournament is still `"setup"`, `POST
  /api/tournaments/[id]/players` requires no admin token at all — same trust model as the
  link itself — so both the admin and anyone with the link can add players, via
  `AddPlayerRow` (admin, embedded as the last row of `RosterList`) or `JoinFields` (public,
  under the "Join this tournament" heading) in `src/components/TournamentView.tsx` — same
  endpoint, different placement since joining is the *primary* action for a visitor but a
  secondary one for the organiser. This works for every format (swiss/rr/drr) since no
  round-1 schedule exists yet to disturb.
  Once `"active"`, the same POST route switches to admin-only + Swiss-only (see "Late joiners"
  below) — self-signup is deliberately cut off the moment Start is pressed. Because players are
  no longer guaranteed by creation-time validation, `/start` now enforces the real minimum
  itself (`Need at least 2 players to start`) rather than assuming it was already met.
  `DELETE /api/tournaments/[id]/players/[playerId]` (admin-only, `"setup"` only) lets the
  organiser prune a duplicate/joke signup before starting — there's no safe "remove" story once
  a round exists and may reference that player.
- **Late joiners** (same `POST /api/tournaments/[id]/players` route, admin-only, Swiss + active
  tournament only): no special catch-up scoring exists or is needed. A player with zero game
  history is already indistinguishable, to `buildPlayerStates()`, from a player who's been
  sitting at 0 the whole event — they just slot into `generatePairings()` normally from the
  next round on. Not offered for `rr`/`drr` - Round Robin's schedule is fixed by player count
  via the circle method at round 1, so a new player can't be spliced into an in-progress
  rotation.
  A late joiner gets the highest seed number, so they'd naturally sort to the very bottom of
  their (likely 0-score) score group — `generatePairings`' bye-selection loop explicitly skips
  anyone with zero games played (`opponents.size === 0`) when picking the bye recipient, as
  long as a more experienced candidate is also eligible (hasn't already had a bye). Without
  this, a newcomer would be quite likely to draw the very round they joined for as a bye
  instead of an actual game - confirmed as a real, confusing case in testing, not just a
  theoretical one. Only falls back to a never-played candidate if literally everyone eligible
  is in that boat (e.g. several late joiners at once with an odd total).
- **Color-streak fairness bug** (fixed): `assignColors`' colorBalance-tie fallback used to
  default to whichever player sorts first (by score, then seed) whenever both tied players'
  `lastColor` matched — in particular, two players who *each* independently won as white last
  round (against different opponents) and then get paired against each other would always give
  white to the higher-ranked one again, letting them collect white indefinitely on repeated
  ties. Real report: a top player got white 3 rounds running this way. Fixed by tracking
  `colorStreak` (consecutive rounds on the same color, computed in `buildPlayerStates`
  alongside `lastColor`) and preferring whoever is more "due" for white — self-corrects within
  one round even in the worst case, since whichever side extends its streak becomes *less* due
  next time, handing white to the other side before a real 3-in-a-row can happen.
- **Invite-link previews**: `/t/[id]`'s `generateMetadata()` (title/description) and
  `opengraph-image.tsx` (the image) drive the WhatsApp/iMessage/Slack/etc link-preview card
  when the invite link is shared - same URL as self-signup, so this is what most people
  actually see first. The image is generated per-request via `next/og`'s `ImageResponse`
  (Satori under the hood) reading the tournament's name/format/rounds/player count/status
  straight from Postgres - deliberately **no emoji and no custom font file**, since those
  need `ImageResponse`'s `emoji` option to fetch glyphs from an external CDN at render time,
  and this renders on every single share; same "can't fail on a missing dependency" instinct
  behind chess-library-api's pre-rendered piece PNGs. If the tournament id doesn't resolve
  (bad/stale link), the image route doesn't throw - it falls back to a generic "Chess
  Tournament" branded card rather than a broken image. Neither `generateMetadata` nor the
  image route needs `metadataBase` set: Next.js resolves the image's absolute URL from the
  incoming request's own origin, so it's correct on localhost, staging, and production
  without a hardcoded domain anywhere. The admin URL (`/t/[id]/admin/[token]`) intentionally
  has no special metadata - it's not meant to be shared, so it just inherits the generic
  root-layout title/description.
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

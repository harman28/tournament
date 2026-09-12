import { ImageResponse } from 'next/og'
import { prisma } from '@/lib/prisma'
import { formatLabel } from '@/lib/swiss'

export const alt = 'Chess Tournament'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const BG = '#09080a'
const ACCENT = '#d4a853'
const TEXT = '#f8f0dd'
const MUTED = '#b89b6c'

// No emoji/external fonts here on purpose - this renders server-side on
// every share, so it should never depend on a CDN fetch succeeding (same
// "can't fail on a missing dependency" instinct as chess-library-api's
// pre-rendered piece PNGs). Plain typography only.
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      _count: { select: { players: true } },
      rounds: { orderBy: { number: 'desc' }, take: 1 },
    },
  })

  const name = tournament?.name ?? 'Chess Tournament'
  const subtitle = tournament
    ? `${formatLabel(tournament.format)} · ${tournament.numRounds} rounds · ${tournament._count.players} player${tournament._count.players === 1 ? '' : 's'}`
    : undefined
  const currentRound = tournament?.rounds[0]?.number

  let statusText = 'Tap to join'
  let statusColor = ACCENT
  if (tournament?.status === 'active') {
    statusText = currentRound ? `● Live · Round ${currentRound} of ${tournament.numRounds}` : '● Live'
    statusColor = '#34d399'
  } else if (tournament?.status === 'complete') {
    statusText = 'Completed'
    statusColor = MUTED
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: BG,
          backgroundImage: `linear-gradient(160deg, #181008 0%, ${BG} 65%)`,
          padding: '72px 88px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 24, fontWeight: 700, letterSpacing: 6, color: ACCENT, textTransform: 'uppercase' }}>
            Chess Tournament
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: name.length > 24 ? 64 : 80,
              fontWeight: 800,
              color: TEXT,
              marginTop: 28,
              lineHeight: 1.1,
              maxWidth: 1000,
            }}
          >
            {name}
          </div>
          {subtitle && (
            <div style={{ display: 'flex', fontSize: 32, color: MUTED, marginTop: 28 }}>
              {subtitle}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignSelf: 'flex-start',
            fontSize: 30,
            fontWeight: 700,
            color: statusColor,
            border: `2px solid ${statusColor}`,
            borderRadius: 999,
            padding: '14px 32px',
          }}
        >
          {statusText}
        </div>
      </div>
    ),
    { ...size }
  )
}

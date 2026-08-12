/**
 * tournamentDescription() - the text shown under the title in link
 * previews (WhatsApp, iMessage, Slack, etc.) when the invite link
 * (/t/[id]) is shared, via generateMetadata() in this same file. The
 * accompanying image is opengraph-image.tsx in this same route segment.
 */

import { describe, it, expect } from 'vitest'
import { tournamentDescription } from './page'

describe('tournamentDescription', () => {
  it('invites the reader to join while the tournament is still setup', () => {
    expect(tournamentDescription('swiss', 4, 8, 'setup')).toBe('Swiss · 4 rounds · 8 players - tap to join')
  })

  it('flags the tournament as live once active', () => {
    expect(tournamentDescription('swiss', 4, 8, 'active')).toBe('Swiss · 4 rounds · 8 players - live now')
  })

  it('marks the tournament as completed once finished', () => {
    expect(tournamentDescription('swiss', 4, 8, 'complete')).toBe('Swiss · 4 rounds · 8 players - completed')
  })

  it('uses the singular "player" for a single-player count', () => {
    expect(tournamentDescription('swiss', 4, 1, 'setup')).toBe('Swiss · 4 rounds · 1 player - tap to join')
  })

  it('spells out the Round Robin format labels', () => {
    expect(tournamentDescription('rr', 5, 6, 'setup')).toBe('Round Robin · 5 rounds · 6 players - tap to join')
    expect(tournamentDescription('drr', 10, 6, 'setup')).toBe('Double Round Robin · 10 rounds · 6 players - tap to join')
  })
})

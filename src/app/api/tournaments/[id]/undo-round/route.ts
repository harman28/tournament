import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

// Lets the organiser undo the most recently generated round - e.g. a result
// was entered wrong in an earlier round, and by the time it's noticed the
// next round has already been generated (possibly already partly played).
// Fixing the old result is already possible at any time via the admin
// PATCH on games/[gameId]/result; this is the other half - discard the
// round that was generated from the wrong data, then Next Round again
// regenerates fresh pairings from the corrected standings.
//
// Only ever undoes the single latest round, never an arbitrary earlier one
// - rounds after that would still be built on data that's about to change,
// so there's no sound way to keep them. Repeatable: calling this again
// peels back one more round.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { adminToken } = await req.json()

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { rounds: { orderBy: { number: 'asc' } } },
  })

  if (!tournament) return Response.json({ error: 'Not found' }, { status: 404 })
  if (tournament.adminToken !== adminToken)
    return Response.json({ error: 'Forbidden' }, { status: 403 })

  const lastRound = tournament.rounds[tournament.rounds.length - 1]
  if (!lastRound) return Response.json({ error: 'No rounds to undo' }, { status: 400 })

  // Games cascade-delete with their Round (schema.prisma: Game.roundId
  // onDelete: Cascade) - nothing else to clean up.
  await prisma.round.delete({ where: { id: lastRound.id } })

  // If that was the only round, there's nothing left to play out yet -
  // back to "setup". Otherwise "active", whether it already was (the
  // common case) or it had just become "complete" by undoing the final
  // round - either way Next Round needs status "active" to run again.
  const remaining = tournament.rounds.length - 1
  const newStatus = remaining === 0 ? 'setup' : 'active'
  await prisma.tournament.update({ where: { id }, data: { status: newStatus } })

  return Response.json({ ok: true, undoneRound: lastRound.number, status: newStatus })
}

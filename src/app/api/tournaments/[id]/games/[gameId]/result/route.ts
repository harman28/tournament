import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

const VALID_RESULTS = ['1-0', '0-1', '1/2-1/2']

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; gameId: string }> }
) {
  const { id, gameId } = await params
  const { result, submittedBy } = await req.json()

  if (!VALID_RESULTS.includes(result)) {
    return Response.json({ error: 'Invalid result' }, { status: 400 })
  }

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: { round: true },
  })

  if (!game || game.round.tournamentId !== id) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
  if (game.result) {
    return Response.json({ error: 'Result already entered' }, { status: 400 })
  }

  await prisma.game.update({
    where: { id: gameId },
    data: {
      pendingResult: result,
      pendingBy: submittedBy?.trim() || 'Anonymous',
    },
  })

  return Response.json({ ok: true })
}

// Admin: enter result directly (no approval needed)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; gameId: string }> }
) {
  const { id, gameId } = await params
  const { result, adminToken } = await req.json()

  if (!VALID_RESULTS.includes(result)) {
    return Response.json({ error: 'Invalid result' }, { status: 400 })
  }

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: { round: { include: { tournament: true } } },
  })

  if (!game || game.round.tournamentId !== id) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
  if (game.round.tournament.adminToken !== adminToken) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.game.update({
    where: { id: gameId },
    data: { result, pendingResult: null, pendingBy: null },
  })

  return Response.json({ ok: true })
}

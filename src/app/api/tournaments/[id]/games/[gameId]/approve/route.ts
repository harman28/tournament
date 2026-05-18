import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; gameId: string }> }
) {
  const { id, gameId } = await params
  const { adminToken, reject } = await req.json()

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
  if (!game.pendingResult) {
    return Response.json({ error: 'No pending result' }, { status: 400 })
  }

  if (reject) {
    await prisma.game.update({
      where: { id: gameId },
      data: { pendingResult: null, pendingBy: null },
    })
  } else {
    await prisma.game.update({
      where: { id: gameId },
      data: {
        result: game.pendingResult,
        pendingResult: null,
        pendingBy: null,
      },
    })
  }

  return Response.json({ ok: true })
}

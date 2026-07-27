import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; playerId: string }> }
) {
  const { id, playerId } = await params
  const { adminToken, fixedBoard } = await req.json()

  const tournament = await prisma.tournament.findUnique({ where: { id } })
  if (!tournament) return Response.json({ error: 'Not found' }, { status: 404 })
  if (tournament.adminToken !== adminToken)
    return Response.json({ error: 'Forbidden' }, { status: 403 })

  const player = await prisma.player.findUnique({ where: { id: playerId } })
  if (!player || player.tournamentId !== id)
    return Response.json({ error: 'Not found' }, { status: 404 })

  if (fixedBoard !== null && (typeof fixedBoard !== 'number' || !Number.isInteger(fixedBoard) || fixedBoard < 1)) {
    return Response.json({ error: 'Board number must be a positive whole number' }, { status: 400 })
  }

  await prisma.player.update({ where: { id: playerId }, data: { fixedBoard } })
  return Response.json({ ok: true })
}

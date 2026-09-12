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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; playerId: string }> }
) {
  const { id, playerId } = await params
  const { adminToken } = await req.json()

  const tournament = await prisma.tournament.findUnique({ where: { id } })
  if (!tournament) return Response.json({ error: 'Not found' }, { status: 404 })
  if (tournament.adminToken !== adminToken)
    return Response.json({ error: 'Forbidden' }, { status: 403 })

  // Only while the roster is still forming - once a round exists, this
  // player may already have games/results referencing them, and there's no
  // "un-pair" story for that. Pruning a bad signup (duplicate, joke name,
  // no-show) is only meaningful before Start generates round 1 anyway.
  if (tournament.status !== 'setup')
    return Response.json({ error: 'Players can only be removed before the tournament starts' }, { status: 400 })

  const player = await prisma.player.findUnique({ where: { id: playerId } })
  if (!player || player.tournamentId !== id)
    return Response.json({ error: 'Not found' }, { status: 404 })

  await prisma.player.delete({ where: { id: playerId } })
  return Response.json({ ok: true })
}

import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { ADMIN_COOKIE_NAME, checkAdminPassword } from '@/lib/adminAuth'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies()
  if (!checkAdminPassword(cookieStore.get(ADMIN_COOKIE_NAME)?.value ?? ''))
    return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params

  const tournament = await prisma.tournament.findUnique({ where: { id } })
  if (!tournament) return Response.json({ error: 'Not found' }, { status: 404 })

  // Players and Rounds (and Rounds' Games) all cascade via their own FK to
  // Tournament/Round - no manual cleanup needed regardless of how far the
  // tournament got (setup/active/complete all delete the same way).
  await prisma.tournament.delete({ where: { id } })

  return Response.json({ ok: true })
}

import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { ADMIN_COOKIE_NAME, checkAdminPassword } from '@/lib/adminAuth'

export async function POST(req: NextRequest) {
  const { password } = await req.json()

  if (typeof password !== 'string' || !checkAdminPassword(password))
    return Response.json({ error: 'Wrong password' }, { status: 401 })

  const cookieStore = await cookies()
  cookieStore.set(ADMIN_COOKIE_NAME, password, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })

  return Response.json({ ok: true })
}

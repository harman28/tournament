import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { ADMIN_COOKIE_NAME, checkAdminPassword } from '@/lib/adminAuth'
import AdminLoginForm from '@/components/AdminLoginForm'
import AdminDashboard from '@/components/AdminDashboard'

export default async function AdminPage() {
  const cookieStore = await cookies()
  const authed = checkAdminPassword(cookieStore.get(ADMIN_COOKIE_NAME)?.value ?? '')

  if (!authed) return <AdminLoginForm />

  const tournaments = await prisma.tournament.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      players: { orderBy: { seed: 'asc' } },
      _count: { select: { rounds: true } },
    },
  })

  return <AdminDashboard tournaments={tournaments} />
}

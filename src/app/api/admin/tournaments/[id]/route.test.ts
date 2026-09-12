/**
 * Site admin deleting a tournament (DELETE /api/admin/tournaments/[id])
 *
 * Gated by the same site-wide admin cookie as the rest of /admin. Deletes
 * the tournament outright regardless of its status (setup/active/complete)
 * - Player and Round rows (and Rounds' Games) all cascade via their own FK
 * to Tournament/Round in schema.prisma, so no manual cleanup is needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const cookieGet = vi.fn()
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: cookieGet })),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    tournament: { findUnique: vi.fn(), delete: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { DELETE } from './route'

const routeParams = { params: Promise.resolve({ id: 'tid1' }) }

function deleteRequest() {
  return new NextRequest('http://localhost/api/admin/tournaments/tid1', { method: 'DELETE' })
}

const ORIGINAL_ENV = process.env.SITE_ADMIN_PASSWORD

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SITE_ADMIN_PASSWORD = 'correct-horse-battery-staple'
})

afterEach(() => {
  process.env.SITE_ADMIN_PASSWORD = ORIGINAL_ENV
})

describe('Access control', () => {
  it('returns 403 when no admin cookie is present', async () => {
    cookieGet.mockReturnValueOnce(undefined)

    const response = await DELETE(deleteRequest(), routeParams)

    expect(response.status).toBe(403)
    expect(vi.mocked(prisma.tournament.delete)).not.toHaveBeenCalled()
  })

  it("returns 403 when the cookie doesn't match SITE_ADMIN_PASSWORD", async () => {
    cookieGet.mockReturnValueOnce({ value: 'wrong' })

    const response = await DELETE(deleteRequest(), routeParams)

    expect(response.status).toBe(403)
    expect(vi.mocked(prisma.tournament.delete)).not.toHaveBeenCalled()
  })
})

describe('Deleting', () => {
  it('returns 404 when the tournament does not exist', async () => {
    cookieGet.mockReturnValueOnce({ value: 'correct-horse-battery-staple' })
    vi.mocked(prisma.tournament.findUnique).mockResolvedValueOnce(null)

    const response = await DELETE(deleteRequest(), routeParams)

    expect(response.status).toBe(404)
    expect(vi.mocked(prisma.tournament.delete)).not.toHaveBeenCalled()
  })

  it('deletes the tournament and returns ok', async () => {
    cookieGet.mockReturnValueOnce({ value: 'correct-horse-battery-staple' })
    vi.mocked(prisma.tournament.findUnique).mockResolvedValueOnce({ id: 'tid1' } as any)
    vi.mocked(prisma.tournament.delete).mockResolvedValueOnce({} as any)

    const response = await DELETE(deleteRequest(), routeParams)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(vi.mocked(prisma.tournament.delete)).toHaveBeenCalledWith({ where: { id: 'tid1' } })
  })

  it('deletes regardless of tournament status (active/complete, not just setup)', async () => {
    cookieGet.mockReturnValueOnce({ value: 'correct-horse-battery-staple' })
    vi.mocked(prisma.tournament.findUnique).mockResolvedValueOnce({ id: 'tid1', status: 'complete' } as any)
    vi.mocked(prisma.tournament.delete).mockResolvedValueOnce({} as any)

    const response = await DELETE(deleteRequest(), routeParams)

    expect(response.status).toBe(200)
  })
})

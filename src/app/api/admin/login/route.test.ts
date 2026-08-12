/**
 * Site admin login (POST /api/admin/login)
 *
 * Gates /admin (which lists every tournament across every user and can
 * delete them) behind a single shared password, set via the
 * SITE_ADMIN_PASSWORD env var. On success, sets an HttpOnly cookie holding
 * the password itself - same direct-comparison trust model this app
 * already uses for a tournament's own adminToken, just applied site-wide.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const cookieSet = vi.fn()
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ set: cookieSet })),
}))

import { POST } from './route'

function loginRequest(password: unknown) {
  return new NextRequest('http://localhost/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
    headers: { 'Content-Type': 'application/json' },
  })
}

const ORIGINAL_ENV = process.env.SITE_ADMIN_PASSWORD

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SITE_ADMIN_PASSWORD = 'correct-horse-battery-staple'
})

afterEach(() => {
  process.env.SITE_ADMIN_PASSWORD = ORIGINAL_ENV
})

describe('Wrong or missing password', () => {
  it('returns 401 for an incorrect password', async () => {
    const response = await POST(loginRequest('wrong'))

    expect(response.status).toBe(401)
    expect(cookieSet).not.toHaveBeenCalled()
  })

  it('returns 401 when password is missing from the body', async () => {
    const response = await POST(loginRequest(undefined))

    expect(response.status).toBe(401)
  })

  it('returns 401 for any password when SITE_ADMIN_PASSWORD is unset - admin is disabled, not open', async () => {
    delete process.env.SITE_ADMIN_PASSWORD

    const response = await POST(loginRequest('anything'))

    expect(response.status).toBe(401)
    expect(cookieSet).not.toHaveBeenCalled()
  })
})

describe('Correct password', () => {
  it('sets an HttpOnly session cookie and returns ok', async () => {
    const response = await POST(loginRequest('correct-horse-battery-staple'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(cookieSet).toHaveBeenCalledWith(
      'site_admin_pw',
      'correct-horse-battery-staple',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax' })
    )
  })
})

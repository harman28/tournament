/**
 * Site admin logout (POST /api/admin/logout)
 *
 * Clears the site-wide admin session cookie set by /api/admin/login.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const cookieDelete = vi.fn()
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ delete: cookieDelete })),
}))

import { POST } from './route'

beforeEach(() => vi.clearAllMocks())

describe('Logging out', () => {
  it('deletes the admin session cookie and returns ok', async () => {
    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(cookieDelete).toHaveBeenCalledWith('site_admin_pw')
  })
})

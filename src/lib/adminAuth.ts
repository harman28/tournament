// Site-wide admin (distinct from a tournament's own adminToken): gates
// /admin, which lists every tournament across every user and can delete
// them. Deliberately simple, matching this app's existing trust model
// (adminToken is compared directly, no hashing) rather than pulling in a
// full auth system for a page only one person is meant to ever see.
export const ADMIN_COOKIE_NAME = 'site_admin_pw'

export function checkAdminPassword(password: string): boolean {
  const expected = process.env.SITE_ADMIN_PASSWORD
  return !!expected && password === expected
}

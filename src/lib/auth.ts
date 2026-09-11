import { timingSafeEqual } from 'node:crypto'

/**
 * Constant-time admin-token check. Plain `===`/`!==` short-circuits on the
 * first differing byte, which is a timing side-channel on a secret compared
 * against attacker-supplied input. `timingSafeEqual` requires equal-length
 * buffers, so a length mismatch (including a non-string `provided`) is
 * checked separately rather than letting it throw.
 */
export function isValidAdminToken(stored: string, provided: unknown): boolean {
  if (typeof provided !== 'string' || provided.length !== stored.length) return false
  return timingSafeEqual(Buffer.from(stored), Buffer.from(provided))
}

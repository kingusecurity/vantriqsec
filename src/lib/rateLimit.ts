import { db } from '@/db/client';

const WINDOW_MINUTES = 10;
const MAX_SUBMISSIONS_PER_WINDOW = 5;

// Global (all-IP) ceiling for the same window. Chosen from this site's
// actual traffic, not guessed: at audit time Turso held 9 total
// submissions across 2 days, never more than 1 in any single minute.
// 30/10min is ~6x the per-IP ceiling and orders of magnitude above real
// traffic, while still capping the case the per-IP limiter can't see —
// many distinct IPs each staying under their own limit — at a firm
// 180/hour instead of unlimited.
const GLOBAL_WINDOW_MINUTES = 10;
const GLOBAL_MAX_SUBMISSIONS_PER_WINDOW = 30;

/**
 * DB-backed rate limit: counts recent submissions from the same IP.
 * In-memory limiting isn't reliable on serverless (no shared state
 * across invocations), so the Turso table doubles as the rate-limit store.
 */
export async function isRateLimited(ip: string): Promise<boolean> {
  const result = await db.execute({
    sql: `SELECT COUNT(*) as count FROM contact_submissions
          WHERE ip = ? AND created_at >= datetime('now', ?)`,
    args: [ip, `-${WINDOW_MINUTES} minutes`],
  });

  const count = Number(result.rows[0]?.count ?? 0);
  return count >= MAX_SUBMISSIONS_PER_WINDOW;
}

/**
 * DB-backed global rate limit: counts recent submissions across every
 * IP, independent of isRateLimited above. Protects against distributed
 * abuse (many IPs, each under their own per-IP limit) that the per-IP
 * check alone can't see. Same storage, same cross-isolate reliability
 * reasoning as isRateLimited.
 *
 * This query can't use the existing (ip, created_at) index efficiently
 * — it doesn't filter on ip, the index's leading column — but at this
 * site's actual table size (single digits of rows) that's inconsequential;
 * not adding a second index for it now.
 */
export async function isGloballyRateLimited(): Promise<boolean> {
  const result = await db.execute({
    sql: `SELECT COUNT(*) as count FROM contact_submissions
          WHERE created_at >= datetime('now', ?)`,
    args: [`-${GLOBAL_WINDOW_MINUTES} minutes`],
  });

  const count = Number(result.rows[0]?.count ?? 0);
  return count >= GLOBAL_MAX_SUBMISSIONS_PER_WINDOW;
}

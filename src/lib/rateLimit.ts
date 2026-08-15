import { db } from '@/db/client';

const WINDOW_MINUTES = 10;
const MAX_SUBMISSIONS_PER_WINDOW = 5;

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

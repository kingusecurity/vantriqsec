import { db } from '@/db/client';

// Deliberately longer than the rate-limit windows (10 min) — "did we
// already email about this" is a different, longer-horizon question
// than "is this a burst of requests." 60 minutes is a starting point,
// not a tested optimum; easy to tune later.
const DUPLICATE_WINDOW_MINUTES = 60;

/**
 * Checks whether a matching submission already exists within the last
 * DUPLICATE_WINDOW_MINUTES. Normalization (trim + lowercase, nothing
 * more) happens only inside this SQL comparison — the stored row's
 * original name/email/message text is never touched, and nothing new
 * is written to the database by this check. Kept deliberately
 * conservative (no whitespace collapsing, no punctuation stripping) so
 * two genuinely different messages are never mistaken for the same
 * inquiry — false positives here would mean silently not telling the
 * owner about a real, distinct lead.
 */
export async function isDuplicateSubmission(
  email: string,
  message: string,
  excludeId: bigint | undefined
): Promise<boolean> {
  const result = await db.execute({
    sql: `SELECT COUNT(*) as count FROM contact_submissions
          WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))
            AND LOWER(TRIM(message)) = LOWER(TRIM(?))
            AND created_at >= datetime('now', ?)
            AND id != ?`,
    args: [email, message, `-${DUPLICATE_WINDOW_MINUTES} minutes`, excludeId ?? -1],
  });

  const count = Number(result.rows[0]?.count ?? 0);
  return count > 0;
}

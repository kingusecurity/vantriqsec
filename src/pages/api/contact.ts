import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { contactSchema } from '@/lib/validateContact';
import { isRateLimited, isGloballyRateLimited } from '@/lib/rateLimit';
import { sendContactNotification } from '@/lib/email';
import { verifyContactToken } from '@/lib/contactToken';

export const prerender = false;

// Generous multiple of the largest legitimate payload — name(120) +
// email(200) + message(4000) chars (worst-case UTF-8 expansion for
// non-ASCII content), the signed contact_token (~300 bytes), and JSON
// structure/field-name overhead — while staying far below Cloudflare's
// own platform-level request body ceiling.
const MAX_BODY_BYTES = 32 * 1024;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Reads the request body up to maxBytes, aborting the stream as soon as
// the limit is exceeded rather than buffering an arbitrarily large
// payload first. Content-Length is checked as a cheap early exit, but
// isn't trusted alone — it can be absent or misreported — so the
// running byte count during the actual read is the real limit.
async function readBodyWithLimit(
  request: Request,
  maxBytes: number
): Promise<{ ok: true; text: string } | { ok: false }> {
  const contentLength = request.headers.get('content-length');
  if (contentLength && Number(contentLength) > maxBytes) {
    return { ok: false };
  }

  if (!request.body) {
    return { ok: true, text: '' };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      return { ok: false };
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return { ok: true, text: new TextDecoder().decode(combined) };
}

export const POST: APIRoute = async ({ request }) => {
  const bodyResult = await readBodyWithLimit(request, MAX_BODY_BYTES);
  if (!bodyResult.ok) {
    return jsonResponse({ error: 'Request body too large.' }, 413);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(bodyResult.text);
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400);
  }

  const parsed = contactSchema.safeParse(payload);
  if (!parsed.success) {
    // Honeypot trip (or any validation failure) — reject without
    // leaking which field failed to a potential bot.
    return jsonResponse({ error: 'Please check your submission and try again.' }, 400);
  }

  // Server-authoritative time trap: verifies a signature only this
  // server could have issued (see /api/contact-token), so — unlike a
  // client-timed check — a bot posting directly to this endpoint can't
  // just send a fake "I waited long enough" value.
  const tokenCheck = await verifyContactToken(parsed.data.contact_token);
  if (!tokenCheck.ok) {
    return jsonResponse({ error: tokenCheck.message }, 400);
  }

  // Astro.clientAddress is not implemented by @astrojs/cloudflare — it
  // throws at runtime ("not available in the @astrojs/cloudflare
  // adapter"), discovered by actually running this under the Workers
  // runtime, not from type-checking (the property type-checks fine on
  // every adapter regardless of whether it's implemented). Cloudflare
  // sets CF-Connecting-IP at its edge before the request reaches the
  // Worker — clients can't spoof it — so that's the real source of truth
  // here instead.
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  // Global check first: a distributed attacker spread across many IPs
  // would never trip the per-IP check below, so this has to run
  // independently of it, before either check does any DB write.
  let globallyLimited: boolean;
  try {
    globallyLimited = await isGloballyRateLimited();
  } catch (error) {
    // Fail closed, same reasoning as the per-IP check below.
    console.error('Global rate limit check failed, rejecting submission:', error);
    return jsonResponse(
      { error: 'Something went wrong. Please try again shortly.' },
      503
    );
  }

  if (globallyLimited) {
    return jsonResponse(
      { error: 'Too many submissions right now. Please try again later.' },
      429
    );
  }

  let limited: boolean;
  try {
    limited = await isRateLimited(ip);
  } catch (error) {
    // Fail closed: if we can't verify the rate limit, don't let the
    // submission through. Turso being unreachable should not become an
    // unlimited-submissions bypass.
    console.error('Rate limit check failed, rejecting submission:', error);
    return jsonResponse(
      { error: 'Something went wrong. Please try again shortly.' },
      503
    );
  }

  if (limited) {
    return jsonResponse(
      { error: 'Too many submissions from this address. Please try again later.' },
      429
    );
  }

  const { name, email, message } = parsed.data;

  let insertResult;
  try {
    insertResult = await db.execute({
      sql: 'INSERT INTO contact_submissions (name, email, message, ip) VALUES (?, ?, ?, ?)',
      args: [name, email, message, ip],
    });
  } catch (error) {
    console.error('Failed to store contact submission:', error);
    return jsonResponse({ error: 'Something went wrong. Please try again shortly.' }, 500);
  }

  // Best-effort — the submission is already safely stored above.
  await sendContactNotification(parsed.data, insertResult.lastInsertRowid);

  return jsonResponse({ ok: true }, 200);
};

import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { contactSchema } from '@/lib/validateContact';
import { isRateLimited } from '@/lib/rateLimit';
import { sendContactNotification } from '@/lib/email';
import { verifyContactToken } from '@/lib/contactToken';

export const prerender = false;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  let payload: unknown;
  try {
    payload = await request.json();
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

  try {
    await db.execute({
      sql: 'INSERT INTO contact_submissions (name, email, message, ip) VALUES (?, ?, ?, ?)',
      args: [name, email, message, ip],
    });
  } catch (error) {
    console.error('Failed to store contact submission:', error);
    return jsonResponse({ error: 'Something went wrong. Please try again shortly.' }, 500);
  }

  // Best-effort — the submission is already safely stored above.
  await sendContactNotification(parsed.data);

  return jsonResponse({ ok: true }, 200);
};

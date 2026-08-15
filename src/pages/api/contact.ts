import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { contactSchema } from '@/lib/validateContact';
import { isRateLimited } from '@/lib/rateLimit';
import { sendContactNotification } from '@/lib/email';

export const prerender = false;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
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

  const ip = clientAddress || 'unknown';

  const limited = await isRateLimited(ip);
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
  await sendContactNotification({ name, email, message, company_website: '' });

  return jsonResponse({ ok: true }, 200);
};

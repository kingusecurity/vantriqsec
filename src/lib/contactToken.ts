import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Server-authoritative replacement for a client-timed "minimum submit
// time" check, which is trivially spoofable (a bot POSTing directly to
// /api/contact never runs the browser timer and can send any value it
// likes). This ties the time window to a signature only the server can
// produce, so a bot has to actually fetch a token first and then wait.
const MIN_SUBMIT_MS = 2000;
const MAX_TOKEN_AGE_MS = 30 * 60 * 1000; // 30 minutes

const secret = import.meta.env.CONTACT_TOKEN_SECRET;
if (!secret) {
  throw new Error('CONTACT_TOKEN_SECRET must be set (see .env.example).');
}

function sign(payloadB64: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

export function createContactToken(): string {
  const payload = JSON.stringify({
    issued_at: Date.now(),
    nonce: randomBytes(16).toString('hex'),
  });
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  const signature = sign(payloadB64);
  return `${payloadB64}.${signature}`;
}

export type TokenVerification =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'malformed' | 'bad_signature' | 'too_fast' | 'expired'; message: string };

const GENERIC_MESSAGE = 'Please check your submission and try again.';

export function verifyContactToken(token: unknown): TokenVerification {
  if (typeof token !== 'string' || token.length === 0) {
    return { ok: false, reason: 'missing', message: GENERIC_MESSAGE };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { ok: false, reason: 'malformed', message: GENERIC_MESSAGE };
  }
  const [payloadB64, signatureB64] = parts;

  let provided: Buffer;
  let expected: Buffer;
  try {
    provided = Buffer.from(signatureB64, 'base64url');
    expected = Buffer.from(sign(payloadB64), 'base64url');
  } catch {
    return { ok: false, reason: 'malformed', message: GENERIC_MESSAGE };
  }

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, reason: 'bad_signature', message: GENERIC_MESSAGE };
  }

  let payload: { issued_at?: unknown };
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed', message: GENERIC_MESSAGE };
  }

  const issuedAt = payload.issued_at;
  if (typeof issuedAt !== 'number' || !Number.isFinite(issuedAt)) {
    return { ok: false, reason: 'malformed', message: GENERIC_MESSAGE };
  }

  const age = Date.now() - issuedAt;
  if (age < MIN_SUBMIT_MS) {
    return { ok: false, reason: 'too_fast', message: 'Submitted too quickly.' };
  }
  if (age > MAX_TOKEN_AGE_MS) {
    return { ok: false, reason: 'expired', message: 'Your session expired — please refresh and try again.' };
  }

  return { ok: true };
}

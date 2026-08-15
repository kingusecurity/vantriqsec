import { env } from 'cloudflare:workers';

// Server-authoritative replacement for a client-timed "minimum submit
// time" check, which is trivially spoofable (a bot POSTing directly to
// /api/contact never runs the browser timer and can send any value it
// likes). This ties the time window to a signature only the server can
// produce, so a bot has to actually fetch a token first and then wait.
//
// Ported from node:crypto to Web Crypto (crypto.subtle) — the Workers
// runtime doesn't have node:crypto available without the nodejs_compat
// flag, and Web Crypto is the native, standard API there anyway.
// crypto.subtle.verify() for HMAC is used directly for signature
// checking rather than a hand-rolled compare-then-diff, since the
// platform's own verify implementation is the timing-safe primitive here
// (equivalent in intent to the old node:crypto timingSafeEqual usage).
const MIN_SUBMIT_MS = 2000;
const MAX_TOKEN_AGE_MS = 30 * 60 * 1000; // 30 minutes

const secret = env.CONTACT_TOKEN_SECRET;
if (!secret) {
  throw new Error('CONTACT_TOKEN_SECRET must be set (see .dev.vars.example for local dev, `wrangler secret put` for deployed environments).');
}

const HMAC_PARAMS = { name: 'HMAC', hash: 'SHA-256' } as const;

// Imported once per isolate and reused — crypto.subtle.importKey is async,
// so this is a cached promise rather than a top-level await, keeping this
// module usable the same way regardless of module-evaluation timing.
const keyPromise = crypto.subtle.importKey('raw', new TextEncoder().encode(secret), HMAC_PARAMS, false, [
  'sign',
  'verify',
]);

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function createContactToken(): Promise<string> {
  const key = await keyPromise;
  const payload = JSON.stringify({ issued_at: Date.now(), nonce: randomNonce() });
  const payloadB64 = toBase64Url(new TextEncoder().encode(payload));
  const signatureBytes = await crypto.subtle.sign(HMAC_PARAMS, key, new TextEncoder().encode(payloadB64));
  const signatureB64 = toBase64Url(new Uint8Array(signatureBytes));
  return `${payloadB64}.${signatureB64}`;
}

export type TokenVerification =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'malformed' | 'bad_signature' | 'too_fast' | 'expired'; message: string };

const GENERIC_MESSAGE = 'Please check your submission and try again.';

export async function verifyContactToken(token: unknown): Promise<TokenVerification> {
  if (typeof token !== 'string' || token.length === 0) {
    return { ok: false, reason: 'missing', message: GENERIC_MESSAGE };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { ok: false, reason: 'malformed', message: GENERIC_MESSAGE };
  }
  const [payloadB64, signatureB64] = parts;

  let signatureBytes: Uint8Array<ArrayBuffer>;
  try {
    signatureBytes = fromBase64Url(signatureB64);
  } catch {
    return { ok: false, reason: 'malformed', message: GENERIC_MESSAGE };
  }

  const key = await keyPromise;
  const valid = await crypto.subtle.verify(
    HMAC_PARAMS,
    key,
    signatureBytes,
    new TextEncoder().encode(payloadB64)
  );
  if (!valid) {
    return { ok: false, reason: 'bad_signature', message: GENERIC_MESSAGE };
  }

  let payload: { issued_at?: unknown };
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
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

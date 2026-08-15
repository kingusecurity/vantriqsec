#!/usr/bin/env node
// Smoke test for the /api/contact chain: fetches a real server-issued
// token (see src/lib/contactToken.ts), does a full successful HTTP round
// trip, then independently verifies the DB write by querying Turso
// directly (never just trusts the HTTP response for that). Also runs the
// negative cases for the token-based time trap: no token, tampered
// token, too-fast, and expired.
//
// Email delivery is inferred (the API deliberately never confirms it to
// the caller — see src/lib/email.ts) with an optional best-effort check
// against the Resend API if a key is available.
//
// Usage:
//   node --env-file=.env scripts/test-contact.mjs
//   node --env-file=.env scripts/test-contact.mjs --url https://vantriq.com
//
// TURSO_DATABASE_URL/TURSO_AUTH_TOKEN are required for the DB verification
// step; RESEND_API_KEY is optional and only enables the best-effort email
// check; CONTACT_TOKEN_SECRET is optional and only enables the "expired
// token" negative case (forging a validly-signed old token requires the
// same secret the server signs with). All picked up from the environment
// (use --env-file to load .env, or export them yourself).

import { createClient } from '@libsql/client';
import { createHmac, randomBytes } from 'node:crypto';

function parseArgs(argv) {
  const args = { url: process.env.TEST_URL || 'http://localhost:4321' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--url' && argv[i + 1]) {
      args.url = argv[++i];
    }
  }
  return args;
}

function log(label, ok, detail) {
  const icon = ok === true ? 'PASS' : ok === false ? 'FAIL' : 'INFO';
  console.log(`[${icon}] ${label}${detail ? ` — ${detail}` : ''}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchToken(baseUrl) {
  const res = await fetch(`${baseUrl}/api/contact-token`);
  if (!res.ok) {
    throw new Error(`token fetch failed: ${res.status}`);
  }
  const data = await res.json();
  return data.token;
}

// Only used for the "expired token" negative case, and only when the
// script has access to the same secret the server signs with.
function forgeToken(issuedAt) {
  const secret = process.env.CONTACT_TOKEN_SECRET;
  const payload = JSON.stringify({ issued_at: issuedAt, nonce: randomBytes(16).toString('hex') });
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${signature}`;
}

async function postContact(baseUrl, payload) {
  const res = await fetch(`${baseUrl}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// Runs a payload that's expected to be rejected (400), and reports
// pass/fail based on whether it actually was.
async function runNegativeCase(baseUrl, label, payload, expectSubstring) {
  const { status, body } = await postContact(baseUrl, payload);
  const rejected = status === 400;
  const messageMatches = !expectSubstring || body?.error?.includes(expectSubstring);
  log(
    label,
    rejected && messageMatches,
    `status ${status}${body?.error ? ` — "${body.error}"` : ''}`
  );
}

async function main() {
  const { url: baseUrl } = parseArgs(process.argv.slice(2));
  const marker = `smoke-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const testEmail = `smoke-test+${marker}@example.com`;
  const testMessage = `Automated smoke test payload. Marker: ${marker}`;
  const basePayload = { name: 'Smoke Test', email: testEmail, message: testMessage, company_website: '' };

  console.log(`Testing ${baseUrl}/api/contact\n`);

  // --- Negative cases first, so they run before the rate limiter has
  // seen any successful submissions from this run. ---

  console.log('Token time-trap negative cases:');

  await runNegativeCase(baseUrl, '  No token', { ...basePayload, contact_token: '' }, null);

  try {
    const validToken = await fetchToken(baseUrl);
    const tampered = validToken.slice(0, -4) + 'xxxx';
    await runNegativeCase(baseUrl, '  Tampered token', { ...basePayload, contact_token: tampered }, null);
  } catch (error) {
    log('  Tampered token', false, `couldn't fetch a token to tamper with: ${error.message}`);
  }

  try {
    const freshToken = await fetchToken(baseUrl);
    await runNegativeCase(
      baseUrl,
      '  Too-fast (no wait after issuing)',
      { ...basePayload, contact_token: freshToken },
      'quickly'
    );
  } catch (error) {
    log('  Too-fast', false, `couldn't fetch a token: ${error.message}`);
  }

  if (process.env.CONTACT_TOKEN_SECRET) {
    const expiredToken = forgeToken(Date.now() - 40 * 60 * 1000); // 40 min ago, > 30 min max age
    await runNegativeCase(baseUrl, '  Expired token (40 min old)', { ...basePayload, contact_token: expiredToken }, 'expired');
  } else {
    log('  Expired token', null, 'skipped — CONTACT_TOKEN_SECRET not in environment (run with `node --env-file=.env`)');
  }

  console.log('\nFull successful chain:');

  // --- The real success path: fetch a token, wait past the minimum,
  // then submit — same sequence a real browser does. ---
  let response;
  let body = null;
  try {
    const token = await fetchToken(baseUrl);
    await sleep(2100); // just over the server's 2s minimum
    const result = await postContact(baseUrl, { ...basePayload, contact_token: token });
    response = { status: result.status };
    body = result.body;
  } catch (error) {
    log('HTTP request', false, `network error: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  log(
    'HTTP request',
    response.status === 200,
    `status ${response.status}${body?.error ? ` — "${body.error}"` : ''}`
  );

  const validationPassed = response.status !== 400;
  log(
    'Validation',
    validationPassed,
    response.status === 400 ? (body?.error ?? 'rejected') : 'accepted'
  );

  if (response.status === 429) {
    log('Rate limit', null, "hit on this run — doesn't prove the DB/email legs; wait ~10 min and retry");
  }
  if (response.status === 503) {
    log('Rate limit check', false, 'infra failure (fails closed) — Turso may be unreachable, see src/lib/rateLimit.ts');
  }

  const dbInsertClaimedOk = response.status === 200;
  log(
    'DB insert (per API response)',
    dbInsertClaimedOk,
    dbInsertClaimedOk ? 'API returned 200' : `API did not confirm (status ${response.status})`
  );

  // Direct Turso verification — don't just trust the HTTP response for this.
  let dbRowFound = null;
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    log(
      'DB row check',
      null,
      'skipped — TURSO_DATABASE_URL/TURSO_AUTH_TOKEN not in environment (run with `node --env-file=.env`)'
    );
  } else {
    try {
      const db = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
      });
      const result = await db.execute({
        sql: 'SELECT id, created_at FROM contact_submissions WHERE email = ? ORDER BY id DESC LIMIT 1',
        args: [testEmail],
      });
      dbRowFound = result.rows.length > 0;
      log(
        'DB row check (direct Turso query)',
        dbRowFound,
        dbRowFound
          ? `found row id ${result.rows[0].id} at ${result.rows[0].created_at}`
          : 'no matching row found'
      );
    } catch (error) {
      log('DB row check (direct Turso query)', false, `query failed: ${error.message}`);
    }
  }

  // Email — the API never confirms this to the caller by design (a
  // failed send must not fail the visitor's request), so this is inferred
  // from the code path, not directly observed, plus an optional best-effort
  // cross-check against Resend's own API.
  const emailAttemptInferred = dbInsertClaimedOk;
  log(
    'Email send attempted (inferred)',
    emailAttemptInferred ? null : false,
    emailAttemptInferred
      ? 'server always calls Resend after a successful DB insert (src/pages/api/contact.ts) — this does not confirm delivery'
      : 'DB insert did not succeed, so the email step never ran'
  );

  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      });
      if (res.ok) {
        const data = await res.json();
        const recent = data?.data?.find((e) => e.to?.includes(process.env.CONTACT_TO_EMAIL));
        log(
          'Resend recent sends (best-effort)',
          Boolean(recent),
          recent
            ? `found send to ${recent.to} at ${recent.created_at}`
            : 'no matching recent send found — API listing may not be reliable for this; check the Resend dashboard directly'
        );
      } else {
        log('Resend recent sends (best-effort)', null, `API returned ${res.status} — check the Resend dashboard directly`);
      }
    } catch (error) {
      log('Resend recent sends (best-effort)', null, `check failed (${error.message}) — check the Resend dashboard directly`);
    }
  } else {
    log('Resend recent sends', null, 'skipped — RESEND_API_KEY not in environment; check the Resend dashboard directly');
  }

  console.log('\nSummary:');
  console.log(`  Validation:             ${validationPassed ? 'pass' : 'fail'}`);
  console.log(`  DB row written:         ${dbRowFound === null ? 'unverified (see above)' : dbRowFound ? 'yes' : 'no'}`);
  console.log(`  Email send attempted:   ${emailAttemptInferred ? 'yes (inferred, not confirmed delivered)' : 'no'}`);
  if (body?.error) {
    console.log(`  API error message:      ${body.error}`);
  }

  const failed = !validationPassed || dbRowFound === false;
  process.exitCode = failed ? 1 : 0;
}

main();

#!/usr/bin/env node
// Smoke test for the /api/contact chain: does an HTTP round trip against
// a running deployment, then independently verifies the DB write by
// querying Turso directly (never just trusts the HTTP response for that).
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
// check. Both are picked up from the environment (use --env-file to load
// .env, or export them yourself).

import { createClient } from '@libsql/client';

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

async function main() {
  const { url: baseUrl } = parseArgs(process.argv.slice(2));
  const marker = `smoke-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const testEmail = `smoke-test+${marker}@example.com`;
  const testMessage = `Automated smoke test payload. Marker: ${marker}`;

  console.log(`Testing ${baseUrl}/api/contact\n`);

  // 1. HTTP round trip — the real path a visitor's browser takes.
  let response;
  let body = null;
  try {
    response = await fetch(`${baseUrl}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Smoke Test',
        email: testEmail,
        message: testMessage,
        company_website: '', // honeypot — must stay empty
        elapsed_ms: 5000, // time trap — must be above the server's minimum
      }),
    });
    body = await response.json().catch(() => null);
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

  // 2. Direct Turso verification — don't just trust the HTTP response for this.
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

  // 3. Email — the API never confirms this to the caller by design (a
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

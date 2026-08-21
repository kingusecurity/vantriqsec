# Security

## Reporting a vulnerability

If you believe you've found a security issue in this site, please email
**security@vantriqsec.com** with details and reproduction steps.
Please don't open a public issue for undisclosed vulnerabilities.

(This is a placeholder inbox — see the placeholder audit in project
notes. Point it at a real, monitored address before launch.)

## Accepted risks

None currently. `npm audit` reports 0 vulnerabilities as of 2026-08-15.

### Resolved: path-to-regexp ReDoS (GHSA-9wv6-86v2-598j)

- **Status:** Resolved by the Cloudflare migration (2026-08-15) — not by
  an upstream patch to the original dependency chain.
- **Was:** Transitive dependency — `@astrojs/vercel` → `@vercel/routing-utils`
  → `path-to-regexp` (4.0.0–6.2.2, vulnerable range).
- **Why it went away:** Removing `@astrojs/vercel` removed
  `@vercel/routing-utils` entirely. `path-to-regexp` is still present in
  the tree (now via `wrangler` → `path-to-regexp@6.3.0`), but 6.3.0 is
  outside the vulnerable range — confirmed via `npm ls path-to-regexp`
  and `npm audit` (0 vulnerabilities) after the migration.
- **Re-check anyway:** `wrangler` is a devDependency that will get
  updated over time; re-run `npm audit` after any `wrangler` bump to
  confirm this stays resolved.

## Design decisions relevant to security

- **Rate limiting fails closed.** The contact form's rate limiter is
  backed by Turso; if the rate-limit check itself fails (e.g. Turso is
  unreachable), the submission is rejected with a 503 rather than let
  through. See `src/pages/api/contact.ts`.
- **CSP has no `'unsafe-inline'` for scripts.** Both client-side scripts
  are served as external files under `public/scripts/` specifically so
  `script-src 'self'` can stay strict. See the "Content Security Policy"
  section in `README.md` before adding any third-party script.
- **Contact submissions are durably stored before notification is
  attempted.** The Turso insert happens first; the Resend notification
  email is best-effort on top, so an email-provider outage never loses a
  submission (see `src/pages/api/contact.ts` and `src/lib/email.ts`).

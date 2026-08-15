# Security

## Reporting a vulnerability

If you believe you've found a security issue in this site, please email
**security@vantriq.com** with details and reproduction steps.
Please don't open a public issue for undisclosed vulnerabilities.

(This is a placeholder inbox — see the placeholder audit in project
notes. Point it at a real, monitored address before launch.)

## Accepted risks

### path-to-regexp ReDoS (GHSA-9wv6-86v2-598j)

- **Status:** Accepted, not fixed.
- **Recorded:** 2026-08-15.
- **Where:** Transitive dependency — `@astrojs/vercel` → `@vercel/routing-utils`
  → `path-to-regexp` (4.0.0–6.2.2, vulnerable range). Surfaced by `npm audit`.
- **Why accepted:**
  - `path-to-regexp` is used by Vercel's build tooling to process this
    project's own static route definitions at build time. It does not
    parse attacker-controlled input at runtime — visitors never supply
    strings that reach this code path.
  - No fix is currently available upstream: the latest `@vercel/routing-utils`
    (checked 2026-08-15) still depends on the vulnerable `path-to-regexp`
    range. `npm audit fix --force` only offers a downgrade of
    `@astrojs/vercel` (11.0.5 → 8.0.4), which does not resolve the
    advisory and is a regression in every other respect.
- **Re-check:** Quarterly, or immediately if `npm audit` reports a new
  advisory in this chain. Run `npm audit` and `npm view @vercel/routing-utils
  dependencies.path-to-regexp` to see whether a non-breaking fix has
  landed upstream.

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

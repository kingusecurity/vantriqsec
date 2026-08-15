# Vantriq

Marketing site for Vantriq — Astro + Tailwind CSS v4, deployed
to Vercel, contact form backed by Turso (libSQL) and Resend.

## Stack

- [Astro](https://astro.build) (server output, `@astrojs/vercel` adapter)
- Tailwind CSS v4 (`@tailwindcss/vite`, CSS-first tokens in
  `src/styles/global.css`)
- [Turso](https://turso.tech) (`@libsql/client`) — contact submissions
  + rate-limit state
- [Resend](https://resend.com) — contact notification email
- `zod` for form validation
- Self-hosted fonts (`@fontsource/inter`, `@fontsource/space-grotesk`)

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create a Turso database**

   ```bash
   turso db create vantriq
   turso db show vantriq --url
   turso db tokens create vantriq
   ```

   Apply the schema:

   ```bash
   turso db shell vantriq < src/db/schema.sql
   ```

   Consider a second database (e.g. `vantriq-dev`) for local
   development so testing doesn't write into production data.

3. **Set up Resend**

   Sign up at resend.com, verify a sending domain (or use their
   sandbox domain while testing), and create an API key.

4. **Copy environment variables**

   ```bash
   cp .env.example .env
   ```

   Fill in `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `RESEND_API_KEY`,
   and `CONTACT_TO_EMAIL`. `.env` is gitignored — never commit real
   values.

5. **Run locally**

   ```bash
   npm run dev
   ```

## Deploying to Vercel

1. Push this repo to a git remote and import it in Vercel, or run
   `vercel` from this directory.
2. In the Vercel project's Environment Variables settings, add
   `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `RESEND_API_KEY`, and
   `CONTACT_TO_EMAIL` (Production and Preview).
3. Security headers are applied both via `vercel.json` and
   `src/middleware.ts` (the latter also covers `/api/contact`, which
   `vercel.json`'s static header rules don't reach on some routing
   configurations — kept as belt-and-suspenders).

## Content Security Policy

The current policy is `script-src 'self'` — no inline scripts, no third-
party script origins, nothing else allowlisted. Both client-side scripts
(`public/scripts/mobile-menu.js`, `public/scripts/contact-form.js`) are
served as genuine external files specifically so this policy can stay
strict (see "Notes" below for why that matters).

**This means adding any of the following will break under the current
policy and requires an explicit CSP change first:**

- Analytics (Plausible, GA, Fathom, etc.) — needs its script origin added
  to `script-src`, and usually `connect-src` for its reporting endpoint.
- A chat widget (Intercom, Crisp, etc.) — typically needs `script-src`,
  `connect-src`, `frame-src`, and sometimes `img-src`/`font-src` additions.
- Any third-party embed (video, forms, maps) — same pattern: check what
  origins it actually loads from and add only those, not a wildcard.

**Where the header is defined (update both, they must stay in sync):**

- `vercel.json` — static header rule applied by Vercel's edge config.
- `src/middleware.ts` — applied per-request in the Astro/Node runtime,
  which also covers `/api/contact` (routes `vercel.json`'s static rules
  don't reliably reach in every routing configuration).

## Notes

- `style-src 'unsafe-inline'` is present in the CSP because Astro
  compiles scoped component styles into inline `<style>` tags in the
  page HTML. `script-src` has no such exception — it stays `'self'`
  only, with no inline scripts or `eval`.
- Contact submissions are always written to Turso first; the Resend
  email is a best-effort notification on top, so an email-provider
  outage never loses a submission or fails the visitor's request.
- See `NOTICE.md` for third-party font and icon licenses.

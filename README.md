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

## Deploy Checklist

Ordered, exact commands for a fresh deploy. Run from the project root
unless noted.

### 0. Install dependencies

```bash
npm install
```

### 1. Turso (contact submissions + rate-limit store)

Install the CLI if you don't have it, and log in:

```bash
curl -sSfL https://get.tur.so/install.sh | bash
turso auth login
```

Create the production database and capture its URL + auth token:

```bash
turso db create vantriq
turso db show vantriq --url
turso db tokens create vantriq
```

Save the URL from `turso db show` and the token from `turso db tokens
create` — you'll paste them into `.env` (step 4) and Vercel (step 3).

Apply the schema:

```bash
turso db shell vantriq < src/db/schema.sql
```

Optional but recommended — a separate dev database so local testing
doesn't write into production data:

```bash
turso db create vantriq-dev
turso db show vantriq-dev --url
turso db tokens create vantriq-dev
turso db shell vantriq-dev < src/db/schema.sql
```

### 2. Resend (contact notification email)

The very first API key has to be created in the dashboard — there's no
bootstrapping command for that (Resend's API itself requires a key to
authenticate):

1. Sign up / log in at https://resend.com.
2. Dashboard → **API Keys** → **Create API Key** → copy it (used in
   step 4/step 3, and in the `curl` calls below via `$RESEND_API_KEY`).

Once you have a key, add and verify the sending domain via the API
(this returns the exact DNS records to create):

```bash
export RESEND_API_KEY=re_your_key_here

curl -X POST https://api.resend.com/domains \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"vantriq.com"}'
```

The response includes a `records` array (SPF `TXT`, DKIM `CNAME`/`TXT`,
and optionally `MX`) with the exact `name`/`type`/`value` to add at
your DNS provider. Add each record there, then confirm propagation:

```bash
dig TXT vantriq.com +short
dig CNAME resend._domainkey.vantriq.com +short
```

Once DNS has propagated (can take a few minutes to a few hours),
trigger verification:

```bash
curl -X POST https://api.resend.com/domains/{domain_id}/verify \
  -H "Authorization: Bearer $RESEND_API_KEY"
```

(`{domain_id}` is in the response from the first `POST /domains`
call.) Confirm status:

```bash
curl https://api.resend.com/domains \
  -H "Authorization: Bearer $RESEND_API_KEY"
```

Look for `"status": "verified"` before relying on `notifications@vantriq.com`
to actually deliver — sends from an unverified domain will fail or land
in spam.

### 3. Vercel — environment variables

Set each variable for both **Production** and **Preview** (the CLI
prompts for the value on stdin, or pipe it):

```bash
vercel link

echo "$TURSO_DATABASE_URL" | vercel env add TURSO_DATABASE_URL production
echo "$TURSO_DATABASE_URL" | vercel env add TURSO_DATABASE_URL preview

echo "$TURSO_AUTH_TOKEN" | vercel env add TURSO_AUTH_TOKEN production
echo "$TURSO_AUTH_TOKEN" | vercel env add TURSO_AUTH_TOKEN preview

echo "$RESEND_API_KEY" | vercel env add RESEND_API_KEY production
echo "$RESEND_API_KEY" | vercel env add RESEND_API_KEY preview

echo "hello@vantriq.com" | vercel env add CONTACT_TO_EMAIL production
echo "hello@vantriq.com" | vercel env add CONTACT_TO_EMAIL preview

CONTACT_TOKEN_SECRET=$(openssl rand -hex 32)
echo "$CONTACT_TOKEN_SECRET" | vercel env add CONTACT_TOKEN_SECRET production
echo "$CONTACT_TOKEN_SECRET" | vercel env add CONTACT_TOKEN_SECRET preview
```

Generate a **separate** `CONTACT_TOKEN_SECRET` for Preview if you want
Preview-issued tokens to be unusable against Production (optional, but
tidy) — otherwise reusing the same value for both is fine, it doesn't
need to match anything else the way the Turso/Resend credentials do.

Use the **production** Turso database's credentials for the
Production environment, and either the same or the `vantriq-dev`
database's credentials for Preview — your call on whether preview
deploys should write into real data.

Verify what's set (values are masked):

```bash
vercel env ls
```

### 4. Local environment

```bash
cp .env.example .env
```

Fill in `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `RESEND_API_KEY`,
`CONTACT_TO_EMAIL`, and `CONTACT_TOKEN_SECRET` (use the `vantriq-dev`
database's credentials here if you created one; for the token secret,
`openssl rand -hex 32` or reuse the one you generated for Vercel above).
`.env` is gitignored — never commit real values.

### 5. Run locally

```bash
npm run dev
```

### 6. Deploy

```bash
vercel --prod
```

Security headers are applied both via `vercel.json` and
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

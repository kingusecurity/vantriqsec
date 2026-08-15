# Vantriq

Marketing site for Vantriq — Astro + Tailwind CSS v4, deployed to
Cloudflare Workers, contact form backed by Turso (libSQL) and Resend.

## Stack

- [Astro](https://astro.build) (server output, `@astrojs/cloudflare` adapter)
- Tailwind CSS v4 (`@tailwindcss/vite`, CSS-first tokens in
  `src/styles/global.css`)
- [Turso](https://turso.tech) (`@libsql/client/web` — the Workers
  entrypoint, not the Node build) — contact submissions + rate-limit state
- [Resend](https://resend.com) — contact notification email
- `zod` for form validation
- Self-hosted fonts (`@fontsource/inter`, `@fontsource/space-grotesk`)

## One-time setup: local secret scan

This repo scans full git history for secrets in CI
(`.github/workflows/ci.yml`, using [gitleaks](https://github.com/gitleaks/gitleaks)
and `.gitleaks.toml`). To catch a secret *before* it ever reaches the
remote, install [gitleaks](https://github.com/gitleaks/gitleaks/releases)
(a single static binary, no package manager required) and then, once
per clone:

```bash
git config core.hooksPath .githooks
```

That points git at `.githooks/pre-commit`, which runs gitleaks against
staged changes before each commit. If gitleaks isn't installed locally
it warns and lets the commit through rather than blocking it — CI is
the backstop either way, so a missing local install degrades safety
but doesn't brick commits for a contributor who hasn't set it up yet.

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
create` — you'll paste them into `.dev.vars` (step 4) and as Worker
secrets (step 3).

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

### 3. Cloudflare — Worker secrets

Requires a Cloudflare account and `wrangler login` once
(`npx wrangler login`). Secrets are per-Worker, not per-environment the
way Vercel's Production/Preview split works — set each one with
`wrangler secret put` (prompts for the value, or pipe it):

```bash
echo "$TURSO_DATABASE_URL" | npx wrangler secret put TURSO_DATABASE_URL
echo "$TURSO_AUTH_TOKEN" | npx wrangler secret put TURSO_AUTH_TOKEN
echo "$RESEND_API_KEY" | npx wrangler secret put RESEND_API_KEY
echo "hello@vantriq.com" | npx wrangler secret put CONTACT_TO_EMAIL

CONTACT_TOKEN_SECRET=$(openssl rand -hex 32)
echo "$CONTACT_TOKEN_SECRET" | npx wrangler secret put CONTACT_TOKEN_SECRET
```

Alternative: the Cloudflare dashboard → Workers & Pages → the `vantriq`
Worker → Settings → Variables and Secrets → Add.

Verify what's set (values are never shown, only names):

```bash
npx wrangler secret list
```

### 4. Local environment

```bash
cp .dev.vars.example .dev.vars
```

Fill in `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `RESEND_API_KEY`,
`CONTACT_TO_EMAIL`, and `CONTACT_TOKEN_SECRET` (use the `vantriq-dev`
database's credentials here if you created one; for the token secret,
`openssl rand -hex 32` or reuse the one you generated in step 3).
`.dev.vars` is gitignored — never commit real values. This is
Wrangler's local-secrets convention file; `astro dev` reads it directly
(it runs under Cloudflare's own Vite plugin + `workerd` runtime, not
plain Node), and `npm run test:contact` reads the same file via Node's
`--env-file` flag — one local secrets file, not two.

Generate the local type declarations (`worker-configuration.d.ts` — this
is gitignored and derived partly from `.dev.vars`, so it isn't committed
and has to be generated locally; re-run this any time `wrangler.jsonc`
or `.dev.vars` change):

```bash
npx wrangler types
```

### 5. Run locally

```bash
npm run dev
```

### 6. Deploy

```bash
npm run deploy
```

(`astro build && wrangler deploy` — see `package.json`.)

Security headers are applied both via `public/_headers` and
`src/middleware.ts` (the latter also covers `/api/contact` and
`/api/contact-token`, which `_headers`' static rules don't reach —
kept as belt-and-suspenders).

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

- `public/_headers` — Cloudflare's static header-rule file, applied at
  the edge to every response including prerendered static pages.
- `src/middleware.ts` — applied per-request inside the Worker itself,
  which also covers `/api/contact` and `/api/contact-token`.

Both are programmatically diffed to confirm they match whenever the
policy changes — see the CSP constant in `src/middleware.ts` and the
`Content-Security-Policy` line in `public/_headers`.

## Notes

- `style-src 'unsafe-inline'` is present in the CSP because Astro
  compiles scoped component styles into inline `<style>` tags in the
  page HTML. `script-src` has no such exception — it stays `'self'`
  only, with no inline scripts or `eval`.
- Contact submissions are always written to Turso first; the Resend
  email is a best-effort notification on top, so an email-provider
  outage never loses a submission or fails the visitor's request.
- `Astro.clientAddress` is **not implemented** by `@astrojs/cloudflare`
  (it throws at runtime, discovered by actually running this under
  `workerd`, not from type-checking). `src/pages/api/contact.ts` reads
  the client IP from the `CF-Connecting-IP` header instead — Cloudflare
  sets it at the edge before the request reaches the Worker, so it
  can't be spoofed by the client.
- Session support and Cloudflare Images are both explicitly disabled in
  `astro.config.mjs` (`session: false`, adapter `imageService:
  'passthrough'`) — the adapter silently auto-provisions a KV namespace
  and an Images binding otherwise, for features this project never uses.
- `nodejs_compat` is enabled in `wrangler.jsonc` as a defensive default
  (every official Astro-on-Cloudflare example includes it), though this
  project's own code doesn't currently need it — verified empirically by
  running the dev server and a full build with the flag removed; both
  worked. `src/lib/contactToken.ts` uses Web Crypto (`crypto.subtle`),
  not `node:crypto`, specifically so it doesn't depend on this flag.
- See `NOTICE.md` for third-party font and icon licenses.
- See `SECURITY.md` for accepted-risk dependency advisories.

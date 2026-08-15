// Explicit Workers entrypoint. @libsql/client's package exports already
// declare a "workerd" condition resolving to the same file for the bare
// import, but that depends on every bundler in the chain setting that
// condition correctly — importing it directly here removes the ambiguity.
import { createClient } from '@libsql/client/web';
import { env } from 'cloudflare:workers';

const url = env.TURSO_DATABASE_URL;
const authToken = env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  throw new Error(
    'TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set (see .dev.vars.example ' +
      'for local dev, `wrangler secret put` for deployed environments). Local ' +
      'SQLite files are not supported — Cloudflare Workers have no writable local ' +
      'filesystem, so this project always talks to a hosted Turso database.'
  );
}

export const db = createClient({ url, authToken });

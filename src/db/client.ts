import { createClient } from '@libsql/client';

const url = import.meta.env.TURSO_DATABASE_URL;
const authToken = import.meta.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  throw new Error(
    'TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set (see .env.example). ' +
      'Local SQLite files are not supported — Vercel serverless functions have ' +
      'an ephemeral filesystem, so this project always talks to a hosted Turso database.'
  );
}

export const db = createClient({ url, authToken });

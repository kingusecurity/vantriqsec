/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly TURSO_DATABASE_URL: string;
  readonly TURSO_AUTH_TOKEN: string;
  readonly RESEND_API_KEY: string;
  readonly CONTACT_TO_EMAIL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

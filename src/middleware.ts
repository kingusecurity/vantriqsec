import { defineMiddleware } from 'astro:middleware';

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'self'; " +
  "form-action 'self'; frame-ancestors 'none'; object-src 'none'; frame-src 'none'; " +
  "upgrade-insecure-requests";

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();

  response.headers.set('Content-Security-Policy', CSP);
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
});

import type { APIRoute } from 'astro';
import { createContactToken } from '@/lib/contactToken';

// Issuing a token requires a fresh timestamp + signature per request,
// which would force contact.astro itself to render dynamically if done
// in its frontmatter. Keeping the page prerendered static and having
// the form fetch a token from this tiny dedicated endpoint on load
// instead — same effect, without giving up the static page.
export const prerender = false;

export const GET: APIRoute = async () => {
  const token = await createContactToken();
  return new Response(JSON.stringify({ token }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};

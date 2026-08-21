import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

const SITE_URL = 'https://vantriqsec.com';

export default defineConfig({
  site: SITE_URL,
  output: 'server',
  adapter: cloudflare({
    // The site never uses <Image>/getImage() — every icon is hand-
    // vendored SVG and og.png is pre-generated as a static file. This is
    // the adapter's OWN imageService option, separate from Astro core's
    // `image.service` — the adapter defaults this to 'cloudflare-binding'
    // regardless of Astro core's image config, which silently provisions
    // an unused Cloudflare Images binding otherwise (confirmed by reading
    // the adapter's source: needsImagesBinding is computed purely from
    // this option, not from checking Astro's own image.service first).
    imageService: 'passthrough',
  }),
  integrations: [sitemap()],
  // Never uses Astro's session API. Without this, the adapter
  // auto-enables a Cloudflare KV session driver by default (confirmed by
  // reading the adapter's source: it checks `session !== false` before
  // auto-wiring one in) and provisions a KV binding with no real
  // namespace ID behind it — a real `wrangler deploy` would need that
  // resolved for a feature this project doesn't use at all.
  session: false,
  vite: {
    plugins: [tailwindcss()],
  },
});

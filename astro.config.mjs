import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

const SITE_URL = 'https://vantriqsec.com';

export default defineConfig({
  site: SITE_URL,
  output: 'server',
  adapter: cloudflare({
    // Every page is fully prerendered, so any <Image>/<Picture> usage is
    // resolved entirely at `astro build` time into static output files —
    // no Cloudflare Images binding is ever needed at runtime. The compound
    // form opts in to that build-time compilation (`build: 'compile'`,
    // confirmed via the adapter's own image-config types: the bare string
    // form `'passthrough'` sets `transformAtBuild: false` and would leave
    // <Image>/<Picture> as a no-op passthrough of the original file) while
    // `runtime: 'passthrough'` keeps the deployed Worker free of any
    // Cloudflare Images binding — this project has no non-prerendered
    // routes that would ever hit the runtime image endpoint anyway.
    imageService: { build: 'compile', runtime: 'passthrough' },
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

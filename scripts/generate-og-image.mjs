#!/usr/bin/env node
// Generates public/og.png (1200x630) for og:image / twitter:image.
// Built entirely from the site's own design tokens and vendored fonts —
// no stock photos, no third-party imagery. Text is rasterized by resvg
// (a real SVG renderer with font-file support), not screenshotted from a
// browser, so output is deterministic and reproducible.
//
// Usage: node scripts/generate-og-image.mjs

import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const WIDTH = 1200;
const HEIGHT = 630;

// Design tokens, copied from src/styles/global.css (kept in sync manually —
// this script intentionally has no runtime dependency on the CSS file).
const COLOR_SURFACE_950 = '#0a0a0a';
const COLOR_BRAND_600 = '#dc2626';
const COLOR_TEXT_PRIMARY = '#f5f5f5';
const COLOR_TEXT_SECONDARY = '#d1d5db';

// Same tagline copy used in the footer (src/components/Footer.astro), for consistency.
const TAGLINE = 'Practical cybersecurity for growing businesses';

// Shield icon path, identical to src/components/icons/Shield.astro (adapted
// from Lucide, ISC License — see NOTICE.md), reused here rather than
// introducing a new asset.
const SHIELD_PATH =
  'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z';

const svg = `
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="78%" cy="22%" r="55%">
      <stop offset="0%" stop-color="${COLOR_BRAND_600}" stop-opacity="0.20" />
      <stop offset="100%" stop-color="${COLOR_BRAND_600}" stop-opacity="0" />
    </radialGradient>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="${COLOR_SURFACE_950}" />
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)" />

  <g transform="translate(100, 190)">
    <path
      d="${SHIELD_PATH}"
      transform="scale(2.6)"
      fill="none"
      stroke="${COLOR_BRAND_600}"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </g>

  <text
    x="96"
    y="360"
    font-family="Space Grotesk"
    font-weight="700"
    font-size="128"
    letter-spacing="2"
    fill="${COLOR_TEXT_PRIMARY}"
  >VANTRIQSEC</text>

  <text
    x="100"
    y="420"
    font-family="Inter"
    font-weight="500"
    font-size="32"
    fill="${COLOR_TEXT_SECONDARY}"
  >${TAGLINE}</text>
</svg>
`.trim();

// resvg (via fontdb/ttf-parser) does not resolve variable-font weight
// axes and does not decode WOFF/WOFF2 — both the @fontsource woff2 files
// and Google's variable TTFs render as blank/wrong-weight text. These are
// static TTF instances of the same two typefaces (Space Grotesk Bold from
// the original designer's repo, Inter Medium from Google's static build),
// vendored here purely for this generation step — not served to visitors;
// the site itself still self-hosts the woff2 files via @fontsource. Same
// OFL license either way; see NOTICE.md.
const fontFiles = [
  path.join(__dirname, 'assets/fonts/SpaceGrotesk-Bold.ttf'),
  path.join(__dirname, 'assets/fonts/Inter-Medium.ttf'),
];

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: WIDTH },
  font: {
    fontFiles,
    loadSystemFonts: false,
    defaultFontFamily: 'Space Grotesk',
  },
  background: COLOR_SURFACE_950,
});

const pngData = resvg.render().asPng();

const outPath = path.join(root, 'public/og.png');
writeFileSync(outPath, pngData);

const meta = await sharp(pngData).metadata();
if (meta.width !== WIDTH || meta.height !== HEIGHT) {
  console.error(`FAIL: expected ${WIDTH}x${HEIGHT}, got ${meta.width}x${meta.height}`);
  process.exitCode = 1;
} else {
  console.log(`OK: wrote ${outPath} at ${meta.width}x${meta.height}`);
}

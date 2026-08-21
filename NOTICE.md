# Third-party assets

This project vendors the following third-party assets at build time.
Nothing is loaded from a CDN at runtime.

## Fonts

- **Inter** — SIL Open Font License 1.1. Bundled via
  [`@fontsource/inter`](https://www.npmjs.com/package/@fontsource/inter).
  https://github.com/rsms/inter

- **Space Grotesk** — SIL Open Font License 1.1. Bundled via
  [`@fontsource/space-grotesk`](https://www.npmjs.com/package/@fontsource/space-grotesk).
  https://github.com/floriankarsten/space-grotesk

- **Build-tooling-only, not served to visitors:** `scripts/assets/fonts/`
  contains static TTF instances of the same two typefaces (Space Grotesk
  Bold, Inter Medium), used solely by `scripts/generate-og-image.mjs` to
  rasterize `public/og.png`. The SVG renderer used for that step doesn't
  resolve variable-font weight axes or decode WOFF2, so these are
  separate static builds of the identical OFL-licensed fonts — Space
  Grotesk Bold from the original designer's repo
  (https://github.com/floriankarsten/space-grotesk/tree/master/fonts/ttf/static),
  Inter Medium from Google's static font build (fonts.gstatic.com). The
  OFL requires the license text to ship alongside the font files
  themselves, not just be mentioned here — the actual license text for
  each is at
  [`scripts/assets/fonts/SpaceGrotesk-OFL.txt`](scripts/assets/fonts/SpaceGrotesk-OFL.txt)
  and
  [`scripts/assets/fonts/Inter-OFL.txt`](scripts/assets/fonts/Inter-OFL.txt).

## Icons

- **Lucide** — ISC License. Individual icon SVGs (Shield, Lock, Server,
  Globe, Mail, MapPin, CheckCircle, AlertTriangle, Menu, X, Cloud,
  GraduationCap) are adapted as local `.astro` components under
  `src/components/icons/`.
  https://lucide.dev · https://github.com/lucide-icons/lucide

## Images

No stock photography or AI-generated imagery is present in the site
as built and shipped.

- **`public/og.png`** — original asset, generated programmatically by
  `scripts/generate-og-image.mjs` from an SVG built entirely from this
  project's own design tokens (colors, the Shield icon above, and the
  fonts above). No photography or third-party imagery involved.

Any imagery added later must be either an original asset or one with a
documented, commercial-use-permitting license — recorded in this file
when added.

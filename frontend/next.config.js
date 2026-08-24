/** @type {import('next').NextConfig} */

// Content-Security-Policy. Keycloak (the login iframe used by silent check-sso,
// plus keycloak-js token/userinfo calls) lives on a separate origin that varies
// per deployment — https in production, http://localhost in local dev — and is
// injected at runtime via /env.js, so it cannot be pinned in this build-time
// config. The directives that must reach it therefore allow the https scheme and
// localhost; everything else is locked to 'self'.
const ContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  // Only same-origin pages may frame the app (clickjacking); the silent check-sso
  // iframe loads on our own origin, so 'self' is required (not 'none').
  "frame-ancestors 'self'",
  // 'unsafe-inline' is needed for Next's framework/runtime and next/font's injected
  // styles. The one HTML sink (rich-text landing copy) is DOMPurify-sanitised; a
  // nonce-based script-src is a possible future tightening.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*",
  "frame-src 'self' https: http://localhost:* http://127.0.0.1:*",
  "form-action 'self' https: http://localhost:* http://127.0.0.1:*",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: ContentSecurityPolicy },
  // Block external framing (clickjacking) for browsers without frame-ancestors.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Stop MIME-sniffing of responses (e.g. served documents).
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Drop access to powerful features the app never uses.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // Enforce HTTPS for two years (ignored by browsers over plain http, e.g. local dev).
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
]

const nextConfig = {
  reactStrictMode: false,
  poweredByHeader: false,
  images: { unoptimized: true },
  typescript: {
    ignoreBuildErrors: true,
  },
  output: 'standalone',
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          ...securityHeaders,
          // Documents (and /public assets like env.js) must revalidate on every
          // load: without this, browsers heuristically cache the HTML and keep
          // referencing the PREVIOUS deploy's immutable chunks — new releases
          // stay invisible until a hard reload. Next.js overrides this header
          // with immutable caching for hashed /_next/static assets, so those
          // stay long-cached as before.
          { key: 'Cache-Control', value: 'no-cache' },
        ],
      },
    ]
  },
};

module.exports = nextConfig;

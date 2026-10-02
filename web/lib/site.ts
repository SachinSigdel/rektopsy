// The site's public origin, for absolute URLs in share metadata (server-side only).
// Vercel sets VERCEL_PROJECT_PRODUCTION_URL; override with NEXT_PUBLIC_SITE_URL.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "");

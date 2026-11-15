import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Recommended alongside Cache Components for new projects (silences the startup warning).
  partialPrefetching: true,
  // Don't let the dev server write an AGENTS.md into the repo.
  agentRules: false,

  // Baseline hardening for every response. The Content-Security-Policy carries only the directives
  // that need no per-request nonce (framing, base URI, form targets, plugins). A script-src
  // policy would need nonces for Next's inline scripts, and is listed under "next steps".
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Ignored over plain http (local development); effective once served over https.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;

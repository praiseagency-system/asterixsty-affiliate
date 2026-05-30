import type { NextConfig } from "next";

const CUSTOM_DOMAIN = "app.praiseagency.id";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "200mb" },
  },
  serverExternalPackages: ["@whiskeysockets/baileys", "pino", "pino-pretty", "node-cron"],

  // ── CORS headers for Chrome Extension + external API routes ─────────────────
  // Requests come from chrome-extension:// origin (service worker / popup).
  // Must include Access-Control-Allow-Origin: * and handle OPTIONS preflight.
  async headers() {
    const CORS = [
      { key: "Access-Control-Allow-Origin",  value: "*" },
      { key: "Access-Control-Allow-Methods", value: "GET, POST, PATCH, DELETE, OPTIONS" },
      { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, X-Workspace-ID" },
      { key: "Access-Control-Max-Age",       value: "86400" },
    ];
    return [
      { source: "/api/extension/:path*", headers: CORS },
      { source: "/api/v1/:path*",        headers: CORS },
    ];
  },

  // ── Domain redirects ────────────────────────────────────────────────────────
  // Belt-and-suspenders redirect alongside the middleware host check.
  // Handles the case where Next.js processes the request before middleware fires.
  async redirects() {
    return [
      {
        source:      "/:path*",
        has:         [{ type: "host", value: "asterixsty-affiliate-production.up.railway.app" }],
        destination: `https://${CUSTOM_DOMAIN}/:path*`,
        permanent:   true, // 301
      },
    ];
  },

  // ── URL rewrites ─────────────────────────────────────────────────────────────
  async rewrites() {
    return [
      {
        source:      "/uploads/:path*",
        destination: "/api/uploads/:path*",
      },
    ];
  },
};

export default nextConfig;

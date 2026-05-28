import type { NextConfig } from "next";

const CUSTOM_DOMAIN = "app.praiseagency.id";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "200mb" },
  },
  serverExternalPackages: ["@whiskeysockets/baileys", "pino", "pino-pretty", "node-cron"],

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

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "200mb" },
  },
  serverExternalPackages: ["@whiskeysockets/baileys", "pino", "pino-pretty", "node-cron"],
};

export default nextConfig;

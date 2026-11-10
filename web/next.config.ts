import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every screen shows live, per-person data (who's clocked in, today's punches), so nothing is cached.
  cacheComponents: false,
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    // Up to five resized invoice photos; Vercel caps request bodies at 4.5 MB.
    serverActions: { bodySizeLimit: "4mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

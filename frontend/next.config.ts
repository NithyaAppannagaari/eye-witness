import type { NextConfig } from "next";
import path from "path";

const sharedAlias = path.resolve(__dirname, "../shared");

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
    resolveAlias: {
      "@shared": sharedAlias,
    },
  },
  webpack(config) {
    config.resolve.alias["@shared"] = sharedAlias;
    return config;
  },
};

export default nextConfig;

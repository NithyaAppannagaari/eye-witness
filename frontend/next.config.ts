import type { NextConfig } from "next";
import path from "path";
import fs from "fs";

// Load NEXT_PUBLIC_* vars from root .env so frontend doesn't need its own env file
const rootEnv = path.resolve(__dirname, "../.env");
if (fs.existsSync(rootEnv)) {
  for (const line of fs.readFileSync(rootEnv, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
}

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

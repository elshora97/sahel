import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// The repo keeps one .env at its root, shared by the API and the web app.
// Next only reads env files next to itself, so load the root one too.
// Variables already set in the real environment win.
try {
  process.loadEnvFile(path.resolve(process.cwd(), "..", ".env"));
} catch {
  // No root .env (CI, production): rely on the real environment.
}

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Unit images travel through a Server Action; the API caps them at 10 MB.
    serverActions: { bodySizeLimit: "11mb" },
  },
};

export default withNextIntl(nextConfig);

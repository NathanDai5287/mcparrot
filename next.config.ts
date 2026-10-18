import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  agentRules: false,
  serverExternalPackages: ["@cursor/sdk", "playwright-core"],
  outputFileTracingIncludes: { "/api/discover": ["./node_modules/@cursor/**"] },
  rewrites: async () => [{ source: "/apps/:path*", destination: "/" }],
  redirects: async () => [
    { source: "/docs", destination: "/docs/index.html", permanent: false },
  ],
};

export default nextConfig;

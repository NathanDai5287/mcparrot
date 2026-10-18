import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

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

export default withSentryConfig(nextConfig, {
  org: "nathan-s4",
  project: "mcparrot",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
});

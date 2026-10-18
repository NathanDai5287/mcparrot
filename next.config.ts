import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  agentRules: false,
  outputFileTracingIncludes: { "/api/teaching": ["./cloud-recorder.mjs", "./cloud-auth.mjs"] },
  rewrites: async () => [{ source: "/apps/:path*", destination: "/" }],
  redirects: async () => [
    { source: "/docs", destination: "/docs/index.html", permanent: false },
  ],
};

export default nextConfig;

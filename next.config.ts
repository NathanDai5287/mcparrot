import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  agentRules: false,
  redirects: async () => [
    { source: "/docs", destination: "/docs/index.html", permanent: false },
  ],
};

export default nextConfig;

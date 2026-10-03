import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@wiwaha/agents", "@wiwaha/db", "@wiwaha/policy", "@wiwaha/ui"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;

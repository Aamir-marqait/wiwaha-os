import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@wiwaha/agents", "@wiwaha/db", "@wiwaha/policy", "@wiwaha/ui"],
  poweredByHeader: false,
  // Media work (D41): sharp and ffmpeg run natively; the brand fonts and the
  // ffmpeg binary must ship with the functions that render.
  serverExternalPackages: ["ffmpeg-static", "sharp"],
  outputFileTracingIncludes: {
    "/**": ["./assets/fonts/**/*"],
    "/api/media/work": ["./node_modules/ffmpeg-static/ffmpeg", "../../node_modules/.pnpm/ffmpeg-static@*/node_modules/ffmpeg-static/ffmpeg"],
    "/api/cron/tick": ["./node_modules/ffmpeg-static/ffmpeg", "../../node_modules/.pnpm/ffmpeg-static@*/node_modules/ffmpeg-static/ffmpeg"],
  },
  // Vercel runs glibc Linux: leave out sharp's musl (Alpine) build.
  outputFileTracingExcludes: {
    "/**": ["../../node_modules/.pnpm/@img+sharp-libvips-linuxmusl-*/**", "../../node_modules/.pnpm/@img+sharp-linuxmusl-*/**"],
  },
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

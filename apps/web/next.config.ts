import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./security-headers";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: buildSecurityHeaders(process.env.NODE_ENV !== "production"),
      },
    ];
  },
};

export default nextConfig;

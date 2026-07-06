import type { NextConfig } from "next";
import { sites } from "./wbs-config.js";

const siteDomains = Object.keys(sites);

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["next-auth"],
  },
  images: {
    remotePatterns: [
      ...siteDomains.map((hostname) => ({
        protocol: "https" as const,
        hostname,
        pathname: "/**",
      })),
      ...siteDomains.map((hostname) => ({
        protocol: "http" as const,
        hostname,
        pathname: "/**",
      })),
      {
        protocol: "https" as const,
        hostname: "**.cloudflare.com",
        pathname: "/**",
      },
      {
        protocol: "https" as const,
        hostname: "**.vercel.app",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;

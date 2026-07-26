import type { NextConfig } from "next";

const backendUrl = new URL(
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
);

const nextConfig: NextConfig = {
  // Keep local route compilation quick; production builds still get compiler optimizations.
  reactCompiler: process.env.NODE_ENV === "production",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "dummyjson.com",
      },
      {
        protocol: backendUrl.protocol.replace(":", "") as "http" | "https",
        hostname: backendUrl.hostname,
        port: backendUrl.port,
        pathname: "/uploads/**",
      },
    ],
  },
};

export default nextConfig;

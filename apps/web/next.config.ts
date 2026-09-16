import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  transpilePackages: ["@summit/portals"],
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  transpilePackages: ["@summit/availability", "@summit/portals", "@summit/session", "@summit/settings", "@summit/nav"],
};

export default nextConfig;

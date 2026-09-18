import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  // @summit/design joins the list now that this app imports its icon
  // components: until now it only ever pulled the package's CSS, which Next
  // handles without transpiling.
  transpilePackages: ["@summit/design", "@summit/portals"],
};

export default nextConfig;

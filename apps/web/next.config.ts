import type { NextConfig } from "next";
import { securityHeadersConfig } from "@summit/portals/security-headers.mjs";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,

  // Every portal serves clinical or HR content and none of the five sent a
  // single security header before this. Shared rather than copied: five
  // header lists drift, and a portal missing frame-ancestors looks exactly
  // like one that has it. See packages/portals/security-headers.mjs.
  headers: securityHeadersConfig,
  // @summit/design joins the list now that this app imports its icon
  // components: until now it only ever pulled the package's CSS, which Next
  // handles without transpiling.
  transpilePackages: ["@summit/design", "@summit/portals"],
};

export default nextConfig;

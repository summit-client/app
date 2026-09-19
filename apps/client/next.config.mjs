import { securityHeadersConfig } from "@summit/portals/security-headers.mjs";
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Every portal serves clinical or HR content and none of the five sent a
  // single security header before this. Shared rather than copied: five
  // header lists drift, and a portal missing frame-ancestors looks exactly
  // like one that has it. See packages/portals/security-headers.mjs.
  headers: securityHeadersConfig,
  transpilePackages: ["@summit/availability", "@summit/design", "@summit/family", "@summit/nav", "@summit/portals", "@summit/session", "@summit/settings", "@summit/proxy-auth", "@summit/toast"],
};
export default nextConfig;

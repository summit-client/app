/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@summit/availability", "@summit/design", "@summit/nav", "@summit/portals", "@summit/session", "@summit/settings", "@summit/proxy-auth", "@summit/toast"],
};
export default nextConfig;

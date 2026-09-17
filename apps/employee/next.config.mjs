/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@summit/availability", "@summit/design", "@summit/settings", "@summit/nav", "@summit/session", "@summit/portals", "@summit/proxy-auth", "@summit/toast"],
};
export default nextConfig;

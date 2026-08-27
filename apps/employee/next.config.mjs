/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@summit/design", "@summit/settings", "@summit/nav", "@summit/session", "@summit/portals"],
};
export default nextConfig;

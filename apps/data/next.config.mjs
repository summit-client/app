/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@summit/design", "@summit/analytics", "@summit/clinical-ai", "@summit/settings", "@summit/nav", "@summit/portals"],
};
export default nextConfig;

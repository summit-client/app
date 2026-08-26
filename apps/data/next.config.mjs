/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@summit/design", "@summit/analytics", "@summit/clinical-ai", "@summit/settings", "@summit/nav"],
};
export default nextConfig;

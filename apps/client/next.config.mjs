/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@summit/design", "@summit/nav", "@summit/portals", "@summit/session", "@summit/proxy-auth"],
};
export default nextConfig;

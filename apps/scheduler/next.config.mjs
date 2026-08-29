/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@summit/nav', '@summit/portals', '@summit/proxy-auth', '@summit/session', '@summit/settings'],
};

export default nextConfig;
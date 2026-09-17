/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@summit/availability', '@summit/nav', '@summit/portals', '@summit/proxy-auth', '@summit/session', '@summit/settings', '@summit/toast'],
};

export default nextConfig;
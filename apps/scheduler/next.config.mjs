/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @summit/design is new here. This app deliberately keeps its own tokens
  // rather than importing that package's CSS (see CLAUDE.md), and that is
  // unchanged - it takes the icon components only, which carry no styling of
  // their own beyond currentColor.
  transpilePackages: ['@summit/availability', '@summit/design', '@summit/nav', '@summit/portals', '@summit/proxy-auth', '@summit/session', '@summit/settings', '@summit/toast'],
};

export default nextConfig;
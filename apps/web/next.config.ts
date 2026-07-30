import type { NextConfig } from "next";

const dataAppUrl = process.env.NEXT_PUBLIC_DATA_APP_URL ??
  (process.env.NODE_ENV === "production" ? "https://data.summitclient.io" : "http://127.0.0.1:3004");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const normalizedDataAppUrl = dataAppUrl.replace(/\/$/, "");

    return [
      {
        source: "/clinician",
        destination: `${normalizedDataAppUrl}/clinician`,
      },
      {
        source: "/clinician/:path*",
        destination: `${normalizedDataAppUrl}/clinician/:path*`,
      },
    ];
  },
};

export default nextConfig;

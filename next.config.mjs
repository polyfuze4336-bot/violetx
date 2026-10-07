/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produce a self-contained server bundle for Azure App Service.
  output: "standalone",
  // Enable instrumentation.ts (Key Vault secret hydration at startup).
  experimental: {
    instrumentationHook: true,
  },
  // Coach share pages carry a secret token in the URL: never leak it via
  // Referer and never cache the response.
  async headers() {
    return [
      {
        source: "/coach/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;

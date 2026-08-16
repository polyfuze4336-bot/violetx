/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produce a self-contained server bundle for Azure App Service.
  output: "standalone",
  // Enable instrumentation.ts (Key Vault secret hydration at startup).
  experimental: {
    instrumentationHook: true,
  },
};

export default nextConfig;

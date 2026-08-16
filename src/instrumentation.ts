// Next.js instrumentation hook — runs once when the server starts.
export async function register() {
  // Only in the Node.js server runtime (not Edge), where the Azure SDKs work.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { hydrateSecretsFromKeyVault } = await import("@/lib/secrets");
    await hydrateSecretsFromKeyVault();

    const { initTelemetry } = await import("@/lib/telemetry");
    await initTelemetry();
  }
}

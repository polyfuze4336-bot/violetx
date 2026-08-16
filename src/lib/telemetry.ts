// Server-side Application Insights telemetry. Initialised only when a
// connection string is present (App Service app setting). Captures request
// failures, exceptions and custom events. Never logs imported message contents.

import type { TelemetryClient } from "applicationinsights";

let client: TelemetryClient | null = null;

export async function initTelemetry(): Promise<void> {
  const conn = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  if (!conn || client) return;

  try {
    const appInsights = await import("applicationinsights");
    appInsights
      .setup(conn)
      .setAutoCollectRequests(true)
      .setAutoCollectExceptions(true)
      .setAutoCollectDependencies(true)
      .setAutoCollectPerformance(false, false)
      .setAutoCollectConsole(false)
      .setSendLiveMetrics(false)
      .setInternalLogging(false, false);
    appInsights.start();
    client = appInsights.defaultClient;
  } catch (error) {
    console.warn("Application Insights failed to initialise:", error);
  }
}

/** Record an unexpected application/API exception. */
export function trackException(
  error: unknown,
  properties?: Record<string, string>
): void {
  if (!client) return;
  const exception =
    error instanceof Error ? error : new Error(String(error));
  client.trackException({ exception, properties });
}

/** Record a named event (e.g. a parsing or import outcome). No message bodies. */
export function trackEvent(
  name: string,
  properties?: Record<string, string>
): void {
  client?.trackEvent({ name, properties });
}

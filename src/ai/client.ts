// AI provider seam. Interpretation always falls back to the deterministic
// parser (safe, no dependency). When Azure OpenAI is configured, Violet uses it
// via Entra managed-identity token auth (the account has API-key auth disabled
// by policy) — proposals stay the same validated shape either way.

export interface AiConfig {
  provider: string;
  hasCredentials: boolean;
}

export function getAiConfig(): AiConfig {
  const provider = process.env.AI_PROVIDER || "azure-openai";
  const hasCredentials = Boolean(
    process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_DEPLOYMENT
  );
  return { provider, hasCredentials };
}

/** Label recorded on the import/audit trail for provenance. */
export function aiProviderLabel(): string {
  const { provider, hasCredentials } = getAiConfig();
  return hasCredentials ? provider : "violet-parser";
}

export function aiModelLabel(): string | null {
  const { hasCredentials } = getAiConfig();
  return hasCredentials ? process.env.AZURE_OPENAI_DEPLOYMENT || null : null;
}

export interface AzureOpenAiConfig {
  endpoint: string;
  deployment: string;
  apiVersion: string;
}

/** Resolved Azure OpenAI settings, or null when the app should use the parser. */
export function getAzureOpenAiConfig(): AzureOpenAiConfig | null {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  if (!endpoint || !deployment) return null;
  return {
    endpoint: endpoint.endsWith("/") ? endpoint : `${endpoint}/`,
    deployment,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-10-21",
  };
}

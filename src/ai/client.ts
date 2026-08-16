// AI provider seam. Interpretation always uses the deterministic parser (safe,
// no key required). When Azure OpenAI is configured, it can be layered in later
// WITHOUT changing business logic — proposals stay the same validated shape.

export interface AiConfig {
  provider: string;
  hasCredentials: boolean;
}

export function getAiConfig(): AiConfig {
  const provider = process.env.AI_PROVIDER || "azure-openai";
  const hasCredentials = Boolean(
    process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT
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

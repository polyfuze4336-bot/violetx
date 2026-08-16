// Loads secrets from Azure Key Vault into process.env at server startup when
// AZURE_KEY_VAULT_NAME is set and the app is running with a managed identity.
//
// This is complementary to Azure App Service "Key Vault references" (which
// populate App Settings directly). If those are used, the corresponding env
// vars are already present and this loader skips them.

import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";

// Env var name -> Key Vault secret name (Key Vault secret names use dashes).
const SECRET_MAP: Record<string, string> = {
  DATABASE_URL: "DATABASE-URL",
  NEXTAUTH_SECRET: "NEXTAUTH-SECRET",
  AZURE_OPENAI_API_KEY: "AZURE-OPENAI-API-KEY",
  AZURE_MAPS_KEY: "AZURE-MAPS-KEY",
};

let hydrated = false;

export async function hydrateSecretsFromKeyVault(): Promise<void> {
  if (hydrated) return;
  hydrated = true;

  const vaultName = process.env.AZURE_KEY_VAULT_NAME;
  if (!vaultName) return;

  const url = `https://${vaultName}.vault.azure.net`;
  const client = new SecretClient(url, new DefaultAzureCredential());

  await Promise.all(
    Object.entries(SECRET_MAP).map(async ([envKey, secretName]) => {
      // Do not overwrite values already provided via App Settings / env.
      if (process.env[envKey]) return;
      try {
        const secret = await client.getSecret(secretName);
        if (secret.value) {
          process.env[envKey] = secret.value;
        }
      } catch {
        console.warn(
          `Key Vault: secret "${secretName}" not found or inaccessible.`
        );
      }
    })
  );
}

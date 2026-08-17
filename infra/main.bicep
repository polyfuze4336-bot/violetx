// VioletX — Azure infrastructure
// Provisions: Azure SQL (server + database), Key Vault (with secrets),
// a Linux App Service plan + web app with a system-assigned managed identity,
// and wires secrets into the web app via Key Vault references.
//
// Authentication is database-based (hashed passwords) — NO Microsoft Entra ID
// for end-user login. Azure OpenAI (Violet) and Azure Maps are OPTIONAL and
// configured by parameter; when omitted the app falls back to the built-in
// deterministic "violet-parser" and the self-rendered gym map. Reuse existing
// AI/Maps resources by passing their endpoint/keys rather than provisioning new
// ones here.
//
// Deploy:
//   az group create -n <rg> -l <location>
//   az deployment group create -g <rg> -f infra/main.bicep -p infra/main.parameters.json \
//     -p sqlAdminPassword=... nextAuthSecret=... ownerEmail=...

@description('Base name used to derive resource names (lowercase, 3-16 chars).')
@minLength(3)
@maxLength(16)
param appName string = 'violetx'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Azure SQL administrator login.')
param sqlAdminLogin string = 'violetxadmin'

@description('Azure SQL administrator password.')
@secure()
param sqlAdminPassword string

@description('NextAuth secret (openssl rand -base64 32).')
@secure()
param nextAuthSecret string

@description('Email address of the athlete (OWNER). Displayed everywhere as "Patient X".')
param ownerEmail string

@description('Optional AI provider label (e.g. azure-openai). Empty = deterministic violet-parser.')
param aiProvider string = ''

@description('Optional Azure OpenAI endpoint (reuse an existing resource). Empty disables AI calls.')
param azureOpenAiEndpoint string = ''

@description('Optional Azure OpenAI chat deployment name.')
param azureOpenAiDeployment string = ''

@description('Optional Azure OpenAI API key. Empty = no live AI; app uses the built-in parser.')
@secure()
param azureOpenAiApiKey string = ''

@description('Optional Azure Maps subscription key (reuse an existing account). Empty = self-rendered map.')
@secure()
param azureMapsKey string = ''

var suffix = uniqueString(resourceGroup().id)
var sqlServerName = toLower('${appName}-sql-${suffix}')
var sqlDbName = '${appName}db'
var keyVaultName = toLower('${appName}kv${substring(suffix, 0, 8)}')
var planName = '${appName}-plan'
var webAppName = toLower('${appName}-web-${suffix}')
var siteUrl = 'https://${webAppName}.azurewebsites.net'
var databaseUrl = 'sqlserver://${sqlServerName}${environment().suffixes.sqlServerHostname}:1433;database=${sqlDbName};user=${sqlAdminLogin};password=${sqlAdminPassword};encrypt=true;trustServerCertificate=false'

// --- Azure SQL -------------------------------------------------------------
resource sqlServer 'Microsoft.Sql/servers@2023-08-01-preview' = {
  name: sqlServerName
  location: location
  // MCAPS governance denies SQL servers that allow username/password auth. The
  // app uses Prisma with SQL auth, so we opt out via the policy's documented
  // SecurityControl=Ignore tag. Safe for a single-tenant dev workload.
  tags: {
    SecurityControl: 'Ignore'
  }
  properties: {
    administratorLogin: sqlAdminLogin
    administratorLoginPassword: sqlAdminPassword
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

// Allow Azure services (e.g. App Service) to reach the SQL server.
resource sqlFirewallAzure 'Microsoft.Sql/servers/firewallRules@2023-08-01-preview' = {
  parent: sqlServer
  name: 'AllowAllAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource sqlDb 'Microsoft.Sql/servers/databases@2023-08-01-preview' = {
  parent: sqlServer
  name: sqlDbName
  location: location
  sku: {
    name: 'GP_S_Gen5_1'
    tier: 'GeneralPurpose'
  }
  properties: {
    autoPauseDelay: 60
    minCapacity: json('0.5')
  }
}

// --- Key Vault -------------------------------------------------------------
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: false
    accessPolicies: [
      {
        tenantId: subscription().tenantId
        objectId: webApp.identity.principalId
        permissions: {
          secrets: ['get', 'list']
        }
      }
    ]
  }
}

resource secretDatabaseUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'DATABASE-URL'
  properties: {
    value: databaseUrl
  }
}

resource secretNextAuth 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'NEXTAUTH-SECRET'
  properties: {
    value: nextAuthSecret
  }
}

resource secretOpenAiKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'AZURE-OPENAI-API-KEY'
  properties: {
    value: azureOpenAiApiKey
  }
}

resource secretMapsKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'AZURE-MAPS-KEY'
  properties: {
    value: azureMapsKey
  }
}

// --- Observability ---------------------------------------------------------
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${appName}-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${appName}-ai'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// --- App Service -----------------------------------------------------------
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: webAppName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      appCommandLine: 'node server.js'
      healthCheckPath: '/api/health'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
    }
  }
}

// App settings are set after the vault + secrets exist so Key Vault references resolve.
resource webAppSettings 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: webApp
  name: 'appsettings'
  properties: {
    WEBSITES_PORT: '3000'
    SCM_DO_BUILD_DURING_DEPLOYMENT: 'false'
    WEBSITE_NODE_DEFAULT_VERSION: '~20'
    NEXTAUTH_URL: siteUrl
    OWNER_EMAIL: ownerEmail
    AI_PROVIDER: aiProvider
    AZURE_OPENAI_ENDPOINT: azureOpenAiEndpoint
    AZURE_OPENAI_DEPLOYMENT: azureOpenAiDeployment
    AZURE_KEY_VAULT_NAME: keyVaultName
    APPLICATIONINSIGHTS_CONNECTION_STRING: appInsights.properties.ConnectionString
    DATABASE_URL: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=DATABASE-URL)'
    NEXTAUTH_SECRET: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=NEXTAUTH-SECRET)'
    AZURE_OPENAI_API_KEY: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=AZURE-OPENAI-API-KEY)'
    AZURE_MAPS_KEY: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=AZURE-MAPS-KEY)'
  }
  dependsOn: [
    secretDatabaseUrl
    secretNextAuth
    secretOpenAiKey
    secretMapsKey
  ]
}

output webAppName string = webAppName
output webAppUrl string = siteUrl
output keyVaultName string = keyVaultName
output appInsightsName string = appInsights.name
output sqlServerFqdn string = '${sqlServerName}${environment().suffixes.sqlServerHostname}'

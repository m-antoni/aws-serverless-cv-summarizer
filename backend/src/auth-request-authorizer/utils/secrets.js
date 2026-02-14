import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// ******** Secrets Manager ******** //
const client = new SecretsManagerClient({ region: 'ap-southeast-1' });

export default async function getSecret(secretName) {
  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await client.send(command);

  // Secrets Manager returns a SecretString or SecretBinary
  if (response.SecretString) {
    // Assuming the secret is a JSON string of credentials
    return JSON.parse(response.SecretString);
  }

  if (response.SecretBinary) {
    // Handle binary secrets if needed
    return response.SecretBinary;
  }
}

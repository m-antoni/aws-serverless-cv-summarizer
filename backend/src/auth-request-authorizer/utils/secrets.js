import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: 'ap-southeast-1' });
const SECRET_NAME = 'cv-summarizer/api-keys';

// Cached secrets in memory (warm start)
let cachedSecrets;

export const getKeysFromSecretsManager = async () => {
  const command = new GetSecretValueCommand({ SecretId: SECRET_NAME });

  const response = await client.send(command);

  if (response.SecretString) {
    return JSON.parse(response.SecretString);
  }

  if (response.SecretBinary) {
    return response.SecretBinary;
  }

  throw new Error('Secrets Manager returned no secret data');
};

// get secrets either from aws secrets manager or memory cached on warm start
export const getSecrets = async () => {
  if (cachedSecrets) return cachedSecrets;
  cachedSecrets = await getKeysFromSecretsManager();
  return cachedSecrets;
};

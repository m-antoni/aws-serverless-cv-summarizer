import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Create a Secrets Manager client outside the main handler for connection reuse
const client = new SecretsManagerClient({ region: process.env.AWS_REGION });

/**
 * Retrieves the secret value from AWS Secrets Manager.
 * @param {string} secretName The name or ARN of the secret.
 */
async function getSecret(secretName) {
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

// Main Lambda handler
export const handler = async (event) => {
  // The 'headers' property contains all incoming request headers
  const headers = event?.headers || {};
  // Access specific header values
  const userAgent = headers['user-agent'] || headers['User-Agent'];
  const authorization = headers['authorization'] || headers['Authorization'];

  try {
    const secretName = 'cv-summarizer/auth-config';
    const keyName = await getSecret(secretName);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Authorizer Lambda',
        userAgent,
        authorization,
        AUTH_CONFIG_SECRET_ID: keyName.AUTH_CONFIG_SECRET_ID,
      }),
    };
  } catch (error) {
    console.log('Error retrieving secret: ', error);
    throw new Error('Failed to retrieve secret value');
  }
};

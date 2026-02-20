// We use '/opt/nodejs' because the Layer ZIP is structured as nodejs/utils/...
// This structure is required so Lambda can also find node_modules automatically.
import { authorizationToken } from '/opt/nodejs/utils/authorization.mjs';
import { checkRateLimit } from '/opt/nodejs/utils/redis.mjs';
import { getSecrets } from '/opt/nodejs/utils/secrets.mjs';

import fetch from 'node-fetch';

// ******** MAIN LAMBDA HANDLER ******** //
export const handler = async (event) => {
  const headers = event?.headers || {};
  const body = event?.body;
  const { file_name, user_id } = JSON.parse(body);

  // Authorization token
  const token = headers['token'] || headers['authorization'] || headers['Authorization'];
  const isAuthorized = await authorizationToken(token);
  if (!isAuthorized) {
    return {
      statusCode: 401,
      body: JSON.stringify({
        error: 'Unauthorized',
      }),
    };
  }

  // Rate limiting
  const userIp =
    event?.requestContext?.http?.sourceIp || event?.requestContext?.identity?.sourceIp || 'unknown';
  const rateLimit = await checkRateLimit(userIp);
  if (!rateLimit.success) {
    return {
      statusCode: 429,
      body: JSON.stringify({
        error: 'Too many requests. Please wait a minute and try again.',
      }),
    };
  }

  try {
    // Get Secrets
    const secrets = await getSecrets();

    // Call Lambda  (get-s3-presigned-url)
    const response = await fetch(secrets.API_PRESIGNED_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify({ file_name, user_id }),
    });

    const data = await response.json();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Success [Authorizer Lambda Function]',
        presigned_url: data.presigned_url,
      }),
    };
  } catch (error) {
    console.error('Error calling Lambda B or retrieving secret: ', error);

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Something went wrong.' }),
    };
  }
};

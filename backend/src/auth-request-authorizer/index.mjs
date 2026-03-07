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
  const { file, user_id, email } = JSON.parse(body);

  // Authorization token
  const token = headers['token'] || headers['authorization'] || headers['Authorization'];
  const isAuthorized = await authorizationToken(token);
  if (!isAuthorized) {
    return {
      statusCode: 401,
      body: JSON.stringify({
        status: 401,
        error: 'Unauthorized, token Invalid',
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
        status: 429,
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
      body: JSON.stringify({ file, user_id, email }),
    });

    const data = await response.json();
    // console.log('[RESPONSE DATA] =====>', data);

    // Error response occured
    if (data.error) {
      console.error('Error calling Presigned URL Lambda: ', data.error);
      return {
        statusCode: 400,
        body: JSON.stringify({ status: 400, error: data.error }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Success [Authorizer Lambda Function]',
        presigned_url: data.presigned_url,
      }),
    };
  } catch (error) {
    console.error('Error calling Presigned URL Lambda: ', error);

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Something went wrong.' }),
    };
  }
};

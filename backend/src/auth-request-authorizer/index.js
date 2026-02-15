import { authorizationToken } from './utils/authorization.js';
import { checkRateLimit } from './utils/redis.js';
import { getSecrets } from './utils/secrets.js';

// ******** MAIN LAMBDA HANDLER ******** //
export const handler = async (event) => {
  const headers = event?.headers || {};

  // authorization token
  const token = headers['token'] || headers['Authorization'];
  const isAuthorized = await authorizationToken(token);
  if (!isAuthorized) {
    return {
      statusCode: 401,
      body: JSON.stringify({
        error: 'Unauthorized',
      }),
    };
  }

  // ratelimiting
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
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Success [Authorizer Lambda Function]',
      }),
    };
  } catch (error) {
    console.error('Error retrieving secret: ', error);
    // Return a proper HTTP response instead of throwing
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Something went wrong.' }),
    };
  }
};

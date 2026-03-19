// We use '/opt/nodejs' because the Layer ZIP is structured as nodejs/utils/...
// This structure is required so Lambda can also find node_modules automatically.
import { authorizationToken } from '/opt/nodejs/utils/authorization.mjs';
import { getSecrets } from '/opt/nodejs/utils/secrets.mjs';
import { snsError } from '/opt/nodejs/utils/sns.mjs';

import os from 'os';
import fetch from 'node-fetch';
import { initRedis } from '/opt/nodejs/utils/redis.mjs';
import { Ratelimit } from '@upstash/ratelimit';

// ******** MAIN LAMBDA HANDLER ******** //
export const handler = async (event, context) => {
  console.log('[EVENT] ===> ', JSON.stringify(event, null, 2));
  console.log('[CONTEXT] ===> ', JSON.stringify(context, null, 2));

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*', // Update to your domain in production
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  // Health Check
  if (event?.httpMethod && event?.httpMethod === 'GET') {
    const lambda = {
      CPU: os.cpus(),
      architecture: os.arch(),
      release: os.release(),
      platform: os.platform(),
      'Total Memory': formatBytes(os.totalmem()),
      'Free Memory': formatBytes(os.freemem()),
    };

    console.log('[HEALTH CHECK] ===> ', JSON.stringify(lambda, null, 2));

    return {
      headers: corsHeaders,
      statusCode: 200,
      body: JSON.stringify({
        status: 200,
        message: 'Authorizer ping successfully',
        lambda,
      }),
    };
  }

  // Authorization token
  const headers = event?.headers || {};
  const token = headers['token'] || headers['authorization'] || headers['Authorization'];
  const isAuthorized = await authorizationToken(token);
  if (!isAuthorized) {
    return {
      headers: corsHeaders,
      statusCode: 401,
      body: JSON.stringify({
        status: 401,
        error: 'Unauthorized, token Invalid',
      }),
    };
  }

  const body = event?.body;
  const { file, user_id, email } = JSON.parse(body);

  // Rate limiting
  const userIp =
    event?.requestContext?.http?.sourceIp || event?.requestContext?.identity?.sourceIp || 'unknown';
  const rateLimiting = await checkRateLimit(userIp);
  if (!rateLimiting.success) {
    return {
      statusCode: 429,
      headers: corsHeaders,
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
      body: JSON.stringify({ file, user_id, email }), // must defined this in frontend otherwise file will not upload to S3
    });

    const data = await response.json();
    // console.log('[RESPONSE DATA] =====>', data);

    // Error response occured
    if (data.error) {
      console.error('Error calling Presigned URL Lambda: ', data.error);
      return {
        headers: corsHeaders,
        statusCode: 400,
        body: JSON.stringify({ status: 400, error: data.error }),
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Authorization verified. Presigned URL generated successfully.',
        presigned_url: data.presigned_url,
      }),
    };
  } catch (error) {
    console.error('Error calling Presigned URL Lambda: ', error);

    // Sending SNS topic error
    await snsError(error, context);

    return {
      headers: corsHeaders,
      statusCode: 500,
      body: JSON.stringify({ error: 'Something went wrong.' }),
    };
  }
};

// Redis rate limiting
// module-scope cache for rate limiter
let rateLimitInstance;
const checkRateLimit = async (userIp) => {
  // init redis
  const redis = await initRedis();

  // create rate limiter once per Lambda container
  if (!rateLimitInstance) {
    rateLimitInstance = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, '1 m'), // 3 requests per 1 minute
      analytics: true,
      prefix: 'cv:ratelimit',
    });
  }

  const { success, limit, remaining, reset } = await rateLimitInstance.limit(userIp);

  return {
    success,
    limit,
    remaining,
    reset,
  };
};

// Format memory values
const formatBytes = (bytes) => {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 Byte';

  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);

  return `${value.toFixed(2)} ${sizes[i]}`;
};

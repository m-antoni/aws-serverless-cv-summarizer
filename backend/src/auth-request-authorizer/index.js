import { initRedis, getRedisValue } from './utils/redis.js';

// ******** MAIN LAMBDA HANDLER ******** //
export const handler = async (event) => {
  // The 'headers' property contains all incoming request headers
  const headers = event?.headers || {};
  // Access specific header values
  const userAgent = headers['user-agent'] || headers['User-Agent'];
  const authorization = headers['authorization'] || headers['Authorization'];

  try {
    const redis = await initRedis();

    const AWS_REGION = await getRedisValue(redis, 'AWS_REGION_ID');
    const S3_BUCKET_NAME = await getRedisValue(redis, 'S3_BUCKET_NAME');
    const AUTH_SECRET_ID = await getRedisValue(redis, 'AUTH_SECRET_ID');

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Authorizer Lambda',
        userAgent,
        authorization,
        AWS_REGION,
        S3_BUCKET_NAME,
        AUTH_SECRET_ID,
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

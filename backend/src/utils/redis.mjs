import { Redis } from '@upstash/redis';
import { getSecrets } from './secrets.mjs';

// module-scope cache
let redisClient;

export const initRedis = async () => {
  // reuse warm client
  if (redisClient) return redisClient;

  const secrets = await getSecrets();

  // init redis
  redisClient = new Redis({
    url: secrets.UPSTASH_REDIS_REST_URL,
    token: secrets.UPSTASH_REDIS_REST_TOKEN,
  });

  // Ping redis only on cold start
  await redisClient.ping();
  console.log('[READY] Redis connection verified.');

  return redisClient;
};

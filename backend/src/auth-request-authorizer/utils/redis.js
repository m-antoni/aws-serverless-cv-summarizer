import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { getSecrets } from './secrets.js';

// module-scope cache
let redisClient;
// module-scope cache for rate limiter
let rateLimitInstance;

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

export const checkRateLimit = async (userIp) => {
  // init redis
  const redis = await initRedis();

  // create rate limiter once per Lambda container
  if (!rateLimitInstance) {
    rateLimitInstance = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, '1 m'), // 3 requests per 1 minute
      analytics: true,
      prefix: '@upstash/ratelimit',
    });
  }

  const { success, limit, remaining, reset } = await rateLimitInstance.limit(userIp);

  return { success, limit, remaining, reset };
};

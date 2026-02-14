import getSecret from './secrets.js';
import { Redis } from '@upstash/redis';

// ******** Initialize Redis ******** //
export const initRedis = async () => {
  const SECRET_NAME = 'cv-summarizer/api-keys';
  const MARKER_KEY = '__secrets_loaded_at';
  const TTL_SECONDS = 3600; // expires 1hr

  let redisClient = null;
  try {
    if (!redisClient) {
      console.log('[MISS] Redis client not initialized. Creating client...');
      // get the secrets
      const secret = await getSecret(SECRET_NAME);

      // initialize redis
      redisClient = new Redis({
        url: secret.UPSTASH_REDIS_REST_URL,
        token: secret.UPSTASH_REDIS_REST_TOKEN,
      });

      // **** Ping redis readiness retry
      await redisClient.ping();
      console.log('[READY] Redis connection verified.');
    }

    // Check NON-SECRET marker
    const isLoaded = await redisClient.exists(MARKER_KEY);

    if (!isLoaded) {
      console.log('[EXPIRED] Secrets expired or missing. Reloading from Secrets Manager...');

      // get the secrets
      const secret = await getSecret(SECRET_NAME);

      // we set a pipeline to prevent multiple calls
      const pipeline = redisClient.pipeline();

      // seed data from aws secrets manager to redis
      for (const key in secret) {
        if (Object.hasOwnProperty.call(secret, key)) {
          // set using key=value
          pipeline.set(key, secret[key], { ex: TTL_SECONDS });
          //   console.log(`${key}:${response[key]}`);
        }
      }

      // marker has same TTL
      pipeline.set(MARKER_KEY, Date.now().toString(), { ex: TTL_SECONDS });

      // now we send all the set key=value in one send
      await pipeline.exec();

      console.log('[SUCCESS] Secrets rehydrated into Redis.');
    } else {
      console.log('[HIT] Secrets still valid (marker present).');
    }

    return redisClient;
  } catch (error) {
    console.log('Error redis client', error);
    throw new Error('Failed to initialize Redis');
  }
};

// ******** Fetching Redis Values ******** //
export const getRedisValue = async (redis, key) => {
  let value = await redis.get(key);
  if (!value) {
    console.log(`[WARNING!!!] Key ${key} not ready in Redis`);
  }
  return value || null;
};

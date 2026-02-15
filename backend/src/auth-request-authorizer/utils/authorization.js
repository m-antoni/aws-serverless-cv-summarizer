import { getSecrets } from './secrets.js';

export const authorizationToken = async (headerToken) => {
  if (!headerToken) return false;

  // Remove 'Bearer ' prefix if present and trim
  const token = headerToken.replace('Bearer ', '').trim();

  const secrets = await getSecrets();

  if (token !== secrets.AUTH_SECRET_ID) {
    return false;
  }

  return true;
};

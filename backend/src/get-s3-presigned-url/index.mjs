// NOTE: AWS Lambda Layers are unzipped into the /opt directory.
// We use '/opt/nodejs' because the Layer ZIP is structured as nodejs/utils/...
// This structure is required so Lambda can also find node_modules automatically.
import { authorizationToken } from '/opt/nodejs/utils/authorization.mjs';
import { getSecrets } from '/opt/nodejs/utils/secrets.mjs';

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Pre-signedUrl Docs: https://www.npmjs.com/package/@aws-sdk/s3-request-presigner
// S3 Docs: https://www.npmjs.com/package/@aws-sdk/client-s3
// ******** PRE-SIGNED URL LAMBDA ******** //
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

  // Validation fields required
  if (!file || !user_id || !email) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'file and email are required.' }),
    };
  }

  try {
    // get secrets
    const secrets = await getSecrets();

    // sets config for the file to be uploaded in s3 bucket
    const s3 = new S3Client({ region: secrets.AWS_REGION_ID });
    const bucketName = secrets.S3_BUCKET_NAME;
    const s3Key = `uploads/${user_id}/${file}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Metadata: {
        'user-id': user_id,
        email: email,
      },
    });

    // create presigned url from S3
    const presignedUrl = await getSignedUrl(s3, command, {
      expiresIn: secrets.PRESIGNED_URL_EXPIRES, // url expires in 5 minutes
      // hoistableHeaders: new Set(['x-amz-user_id', 'x-amz-file']),
    });
    // console.log('[PRESIGNED] ===> ', presignedUrl);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Success [S3 Get PresignedURL Lambda Function]',
        presigned_url: presignedUrl,
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

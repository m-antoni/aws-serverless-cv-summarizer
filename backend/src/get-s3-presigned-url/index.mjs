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
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*', // Update to your domain in production
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  const headers = event?.headers || {};
  const body = event?.body;
  const { file, user_id, email } = JSON.parse(body);

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
      expiresIn: secrets.PRESIGNED_URL_EXPIRES,
      // By default, the SDK tries to move custom headers into the URL query parameters ("hoisting").
      // Since S3 expects these metadata headers to be part of the request payload, we use
      // 'unhoistableHeaders' to force them to remain as explicit HTTP headers in the signature.
      // *** NOTE: You must include these exact headers in your frontend fetch request
      // (x-amz-meta-user-id and x-amz-meta-email), or S3 will return a 403 Forbidden.
      unhoistableHeaders: new Set(['x-amz-meta-user-id', 'x-amz-meta-email']),
    });

    return {
      headers: corsHeaders,
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
      headers: corsHeaders,
      statusCode: 500,
      body: JSON.stringify({ error: 'Something went wrong.' }),
    };
  }
};

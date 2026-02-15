import { authorizationToken } from './utils/authorization.js';
import { getSecrets } from './utils/secrets.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ******** MAIN LAMBDA HANDLER ******** //
export const handler = async (event) => {
  const headers = event?.headers || {};
  const body = event?.body;
  const { file_name, user_id } = JSON.parse(body);

  // Authorization token
  const token = headers['token'] || headers['authorization'] || headers['Authorization'];
  const isAuthorized = await authorizationToken(token);
  if (!isAuthorized) {
    return {
      statusCode: 401,
      body: JSON.stringify({
        error: 'Unauthorized',
      }),
    };
  }

  if (!file_name || !user_id) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'file_name and user_id are required.' }),
    };
  }

  try {
    // get secrets
    const secrets = await getSecrets();

    const s3 = new S3Client({ region: secrets.AWS_REGION_ID });
    const bucketName = secrets.S3_BUCKET_NAME;
    const s3Key = `uploads/${user_id}/${file_name}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
    });

    const presignedUrl = await getSignedUrl(s3, command, {
      expiresIn: secrets.PRESIGNED_URL_EXPIRES,
    }); // url expires in 5 minutes

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

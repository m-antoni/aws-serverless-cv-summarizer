// NOTE: AWS Lambda Layers are unzipped into the /opt directory.
// We use '/opt/nodejs' because the Layer ZIP is structured as nodejs/utils/...
// This structure is required so Lambda can also find node_modules automatically.
import { getSecrets } from '/opt/nodejs/utils/secrets.mjs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { Resend } from 'resend';

// Configure AWS clients
const secrets = await getSecrets();
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({ region: secrets.AWS_REGION_ID });

// Configure Resent Email API
const resend = new Resend(secrets.RESEND_API_KEY);

// https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/InvokeCommand/
// ******** MAIN HANDLER *********** //
export const handler = async (event) => {
  // Loggin Event
  console.log('[CLEANUP EVENT] ===> ', event);

  // Run S3 cleanup
  const s3Response = await cleanUpS3();
  const s3Data = JSON.parse(s3Response.body);

  // Run DynamoDB cleanup
  const dbResponse = await cleanUpDynamoDBTable();
  const dbData = JSON.parse(dbResponse.body);

  // Resend Email API: Send email with the results
  await resendEmailAPI({
    total_files_deleted: s3Data.total_files_deleted,
    bucket_name: s3Data.bucket_name,
    total_items_deleted: dbData.total_items_deleted,
    table_name: dbData.table_name,
  });
};

// ******** Cleaup files in S3 *********** //
const cleanUpS3 = async () => {
  try {
    const BUCKET_NAME = secrets.S3_BUCKET_NAME;
    const folderPrefix = 'uploads/'; // Ensure this ends with a '/'
    let isTruncated = true;
    let continuationToken;
    let totalFilesDeleted = 0;

    while (isTruncated) {
      const listCommand = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: folderPrefix,
        ContinuationToken: continuationToken,
      });

      const listResponse = await s3.send(listCommand);

      if (listResponse.Contents && listResponse.Contents.length > 0) {
        // Map the objects to the format required by DeleteObjectsCommand
        const objectsToDelete = listResponse.Contents.map((obj) => ({
          Key: obj.Key,
        }));

        // Delete Command
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: BUCKET_NAME,
          Delete: { Objects: objectsToDelete },
        });

        const response = await s3.send(deleteCommand);

        totalFilesDeleted += objectsToDelete.length;
        console.log(`[S3 DELETED: ${objectsToDelete.length} files.`, response);
      }

      isTruncated = listResponse.IsTruncated;
      continuationToken = listResponse.NextContinuationToken;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        total_files_deleted: totalFilesDeleted,
        bucket_name: BUCKET_NAME,
        message: 'S3 Cleanup complete',
      }),
    };
  } catch (error) {
    console.error('[ERROR: Cleaning up S3 Files]', error);
    throw error;
  }
};

// ******** Cleaup Records in DynamoDB *********** //
const cleanUpDynamoDBTable = async () => {
  try {
    const TABLE_NAME = secrets.DYNAMODB_TABLE_NAME;
    let lastEvaluatedKey = undefined;
    let totalItemsDeleted = 0;

    do {
      // Scan for items (retrieving only the primary key)
      const scanCommand = new ScanCommand({
        TableName: TABLE_NAME,
        ProjectionExpression: 'job_id',
        ExclusiveStartKey: lastEvaluatedKey,
      });

      const scanResult = await db.send(scanCommand);

      if (scanResult.Items && scanResult.Items.length > 0) {
        // Map all scanned items to delete requests first
        const allDeleteRequests = scanResult.Items.map((item) => ({
          DeleteRequest: {
            Key: { job_id: item.job_id },
          },
        }));

        // Process in chunks of 25 to respect DynamoDB limits
        for (let i = 0; i < allDeleteRequests.length; i += 25) {
          const chunk = allDeleteRequests.slice(i, i + 25);

          const batchCommand = new BatchWriteCommand({
            RequestItems: {
              [TABLE_NAME]: chunk,
            },
          });

          const response = await db.send(batchCommand);

          totalItemsDeleted += chunk.length;
          console.log(`[DB BatchWriteCommand: Deleted ${chunk.length} items.]`, response);
        }
      }

      lastEvaluatedKey = scanResult.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return {
      statusCode: 200,
      body: JSON.stringify({
        total_items_deleted: totalItemsDeleted,
        table_name: TABLE_NAME,
        message: 'DynamoDB Cleanup complete',
      }),
    };
  } catch (error) {
    console.error('[ERROR: Cleaning DynamoDB Records]', error);
    throw error;
  }
};

// ******** Resend Email ******** //
const resendEmailAPI = async (payload) => {
  console.log('[RESEND EMAIL API] ===> ', payload);

  // Resend Email with template
  const { data, error } = await resend.emails.send({
    from: 'cv-summarizer-app@resend.dev',
    to: 'michaelantoni.tech@gmail.com',
    subject: 'AWS CV Summarizer - Cleanup Job',
    html: `
        <div style="font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; border: 1px solid #ddd; border-radius: 3px; overflow: hidden;">
          <div style="background-color: #121212; color: white; padding: 15px; text-align: center;">
              <h2 style="margin: 0; font-size: 18px;">AWS Serverless CV Summarizer - Cleanup Job</h2>
          </div>
          <div style="padding: 20px;">
              <p style="border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 15px;">
                <strong>Date :</strong> ${new Date().toLocaleString('en-US', {
                  timeZone: 'Asia/Manila',
                })}
              </p>
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <tr>
                    <td style="padding: 8px 0; width:180px;"><strong>S3 Bucket Name:</strong></td>
                    <td style="padding: 8px 0;">${payload.bucket_name}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; width:180px;"><strong>Total Deleted Files:</strong></td>
                    <td style="padding: 8px 0;">${payload.total_files_deleted}</td>
                </tr>
                 <tr>
                    <td style="padding: 8px 0; width:180px;"><strong>DynamoDB Table Name:</strong></td>
                    <td style="padding: 8px 0;">${payload.table_name}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; width:180px;"><strong>Total Deleted items:</strong></td>
                    <td style="padding: 8px 0;">${payload.total_items_deleted}</td>
                </tr>
              </table>
          </div>
          <div style="background-color: #f1f1f1; color: #6c757d; padding: 10px; text-align: center; font-size: 12px;">
              Automated notification via Resend Email API: <a href="https://resend.com" style="color: #007BFF; text-decoration: none;">https://resend.com</a>
          </div>
        </div>
      `,
  });

  if (error) console.error('[RESEND ERROR]', error.stack || error);

  return !error ? { success: true } : { success: false };
};

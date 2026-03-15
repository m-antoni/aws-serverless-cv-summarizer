// NOTE: AWS Lambda Layers are unzipped into the /opt directory.
// We use '/opt/nodejs' because the Layer ZIP is structured as nodejs/utils/...
// This structure is required so Lambda can also find node_modules automatically.
import { getSecrets } from '/opt/nodejs/utils/secrets.mjs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  S3Client,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { Resend } from 'resend';
import { v4 as uuidv4 } from 'uuid';

// Configure AWS clients
const secrets = await getSecrets();
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({ region: secrets.AWS_REGION_ID });

const TABLE_NAME = secrets.DYNAMODB_TABLE_NAME;
const LOG_TABLE = secrets.DYNAMODB_LOG_TABLE;
const BUCKET_NAME = secrets.S3_BUCKET_NAME;

// Configure Resent Email API
const resend = new Resend(secrets.RESEND_API_KEY);

// https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/InvokeCommand/
// ******** MAIN HANDLER *********** //
export const handler = async (event) => {
  let log_event = null;

  // Loggin Event
  console.log('[CLEANUP EVENT] ===> ', event);
  if (event.source !== 'cv-summarizer-archive-job-records' || !event.logs?.success) {
    console.log('NOT TRIGGER SKIPPING!!!');
    return;
  }
  console.log('[HANDLER RUNNNING...]');

  // assign global variable
  log_event = event.logs;

  // Read JSON File from event payload
  const jsonData = await readJSONFile(event.logs.cleanup_jobs);
  // console.log('[JSONDATA ===> ]', jsonData);

  // Run S3 and DynamoDB cleanup in parallel
  const [s3Result, dbResult] = await Promise.all([cleaupS3(), cleanupDynamoDB(jsonData)]);

  console.log('[S3 CLEANUP RESULT]', s3Result);
  console.log('[DYNAMODB CLEANUP RESULT]', dbResult);

  // Create logs in DynamoDB
  await createArchiveLog(createCleanupLogPayload(s3Result, dbResult, log_event));

  // Resend Email API
  await sendEmail(createCleanupLogPayload(s3Result, dbResult, log_event));
};

// ******** Read JSON file from S3 *********** //
const readJSONFile = async ({ key }) => {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
    const bodyString = await res.Body.transformToString();
    return JSON.parse(bodyString);
  } catch (error) {
    console.log('[ERROR Failed to read JSON File]', error);
    throw new Error('Failed to read JSON from S3');
  }
};

// ******** S3 Cleanup job *********** //
const cleaupS3 = async () => {
  let totalDeleted = 0;
  let totalFailed = 0;
  let errorDetails = []; // To store specific reasons
  let isTruncated = true;
  let continuationToken;

  while (isTruncated) {
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: 'uploads/',
      ContinuationToken: continuationToken,
    });

    const listResponse = await s3.send(listCommand);
    if (!listResponse.Contents || listResponse.Contents.length === 0) break;

    const objectsToDelete = listResponse.Contents.map((item) => ({ Key: item.Key }));

    const deleteCommand = new DeleteObjectsCommand({
      Bucket: BUCKET_NAME,
      Delete: { Objects: objectsToDelete },
    });

    try {
      const deleteResponse = await s3.send(deleteCommand);

      // Log successes
      totalDeleted += deleteResponse.Deleted?.length || 0;

      // Capture and log specific errors
      if (deleteResponse.Errors && deleteResponse.Errors.length > 0) {
        totalFailed += deleteResponse.Errors.length;

        deleteResponse.Errors.forEach((err) => {
          console.error(
            `[ERROR S3 CLEANUP: FAILED] Key: ${err.Key} | Code: ${err.Code} | Message: ${err.Message}`
          );
          // Optional: Store only first 10 errors to avoid bloating the return object
          if (errorDetails.length < 10) errorDetails.push(err);
        });
      }
    } catch (err) {
      console.error('[ERROR S3 CLEANUP CRITICAL BATCH ERROR]:', err);
    }

    isTruncated = listResponse.IsTruncated;
    continuationToken = listResponse.NextContinuationToken;
  }

  return {
    success: true,
    total_files_deleted: totalDeleted,
    total_failed: totalFailed,
    error_details: errorDetails,
    s3_folder: 'uploads/',
  };
};

// ******** Cleaup Records in DynamoDB *********** //
const cleanupDynamoDB = async (data) => {
  if (!data || data.length === 0) return { total_items_deleted: 0, table_name: TABLE_NAME };

  // Convert input to DynamoDB DeleteRequest objects
  const deleteRequests = data.map((item) => ({
    DeleteRequest: { Key: { job_id: item.job_id } },
  }));

  const chunkSize = 25; // DynamoDB BatchWrite limit
  let totalDeleted = 0;

  for (let i = 0; i < deleteRequests.length; i += chunkSize) {
    let chunk = deleteRequests.slice(i, i + chunkSize);

    let unprocessed = chunk;
    // Retry unprocessed items until all are deleted
    while (unprocessed.length > 0) {
      const command = new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: unprocessed,
        },
      });

      try {
        const response = await db.send(command);
        const processedCount =
          unprocessed.length - (response.UnprocessedItems?.[TABLE_NAME]?.length || 0);
        totalDeleted += processedCount;

        // Prepare next retry for unprocessed items
        unprocessed = response.UnprocessedItems?.[TABLE_NAME] || [];

        if (unprocessed.length > 0) {
          console.log(`[DYNAMODB RETRY] Retrying ${unprocessed.length} unprocessed items...`);
        }
      } catch (err) {
        console.error('[ERROR deleting DynamoDB items]:', err);
        break; // Stop retrying this chunk if there is a fatal error
      }
    }
  }

  console.log(`[CLEANUP DYNAMODB] Total items deleted: ${totalDeleted}`);

  return {
    success: true,
    total_items_deleted: totalDeleted,
    total_failed: deleteRequests.length - totalDeleted,
    table_name: TABLE_NAME,
  };
};

// ******** Create Cleanup Payload *********** //
const createCleanupLogPayload = (s3Result, dbResult, eventLogs) => {
  return {
    log_id: uuidv4(),
    s3_cleanup: {
      bucket_name: eventLogs.bucket_name,
      success: s3Result.success,
      total_deleted_files: s3Result.total_files_deleted || 0,
      total_failed: s3Result.total_failed || 0,
      s3_folder: s3Result.s3_folder || 'N/A',
      source_url: eventLogs.cleanup_jobs?.url || 'N/A',
      source_key: eventLogs.cleanup_jobs?.key || 'N/A',
    },
    dynamodb_cleanup: {
      success: dbResult.success,
      total_deleted_items: dbResult.total_items_deleted || 0,
      total_failed: dbResult.total_failed || 0,
      table_name: dbResult.table_name || 'N/A',
    },
    created_at: new Date().toISOString(),
  };
};

// ******** Create logs in DynamoDB *********** //
const createArchiveLog = async (payload) => {
  try {
    const response = await db.send(new PutCommand({ TableName: LOG_TABLE, Item: payload }));
    console.log('[SUCCESS Log Created]', response);
  } catch (error) {
    console.log('[ERROR Failed To Create Log in DynamoDB]', error);
  }
};

// ******** RESEND Email Api *********** //
const sendEmail = async (payload) => {
  console.log('[RESEND PAYLOAD RECEIVED] ===> ', payload);
  if (!payload) {
    console.log('[RESEND SKIPPED] Payload is missing.');
    return;
  }

  // Resend Email with template
  const { data, error } = await resend.emails.send({
    from: 'cv-summarizer-app@resend.dev',
    to: 'michaelantoni.tech@gmail.com',
    subject: 'AWS CV Summarizer - Cleanup Job',
    html: `
        <div style="font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; border: 1px solid #ddd; border-radius: 3px; overflow: hidden;">
          <div style="background-color: #121212; color: white; padding: 15px; text-align: center;">
              <h2 style="margin: 0; font-size: 18px;">AWS Serverless CV Summarizer - Cleanup</h2>
          </div>
          <div style="padding: 20px;">
              <p style="margin: 0; padding: 0;">
                <strong>Github:</strong> https://m-antoni-serverless-cv-summarizer.vercel.app
              </p>
              <p style="margin: 0; padding: 0;">
                <strong>URL:</strong> https://github.com/m-antoni/aws-serverless-cv-summarizer
              </p>
              <p style="border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 15px;">
                  <strong>Date :</strong> ${new Date().toLocaleString('en-US', {
                    timeZone: 'Asia/Manila',
                  })}
              </p>
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <tr>
                    <td style="padding: 8px 0; width:180px;"><strong>S3 Bucket:</strong></td>
                    <td style="padding: 8px 0;">${payload.s3_cleanup.bucket_name}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; width:180px;"><strong>S3 Cleanup Success:</strong></td>
                    <td style="padding: 8px 0;">${payload.s3_cleanup.total_deleted_files}
                </tr>
                <tr>
                    <td style="padding: 8px 0; width:180px;"><strong>S3 Cleanup Failed:</strong></td>
                    <td style="padding: 8px 0;">${payload.s3_cleanup.total_failed}</td>
                </tr>
              
                <tr>
                    <td style="padding: 8px 0; width:180px;"><strong>DynamoDB Cleanup Success:</strong></td>
                    <td style="padding: 8px 0;">${payload.dynamodb_cleanup.total_deleted_items}</td>
                </tr>
                 <tr>
                    <td style="padding: 8px 0; width:180px;"><strong>DynamoDB Cleanup Failed:</strong></td>
                    <td style="padding: 8px 0;">${payload.dynamodb_cleanup.total_failed}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; width:180px;"><strong>DynamoDB Table Name:</strong></td>
                    <td style="padding: 8px 0;">${payload.dynamodb_cleanup.table_name}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; width:180px;"><strong>Archived Log id:</strong></td>
                    <td style="padding: 8px 0;">${payload.log_id}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; width:180px;"><strong>Archived Log:</strong></td>
                    <td style="padding: 8px 0;">${payload.s3_cleanup.source_key}</td>
                </tr>
              </table>
          </div>
          <div style="background-color: #f1f1f1; color: #6c757d; padding: 10px; text-align: center; font-size: 12px;">
              Automated notification via Resend Email API
          </div>
        </div>
      `,
  });

  if (error) console.error('[RESEND ERROR]', error.stack || error);

  return !error ? { success: true } : { success: false };
};

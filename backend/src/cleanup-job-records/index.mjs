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

  // Run cleanup for S3 and DynamoDB
  const s3Data = await cleanupS3();
  const dbData = await cleanupDynamoDB();

  // Checking payload
  console.log('FINAL PAYLOAD TO EMAIL:', { s3: s3Data, db: dbData });

  // Don't send email if zero values
  if (s3Data?.total_files_deleted === 0 && dbData?.total_items_deleted === 0) {
    console.log(`[RESEND SKIPPED] Paylod empty or zero, email not sent!!!`);
    return;
  } else {
    // Resend Email API: Send email with the results
    await resendEmailAPI({
      total_files_deleted: s3Data.total_files_deleted,
      bucket_name: s3Data.bucket_name,
      total_items_deleted: dbData.total_items_deleted,
      table_name: dbData.table_name,
    });
  }
};

// ******** Cleaup files in S3 *********** //
const cleanupS3 = async () => {
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

      // Add this to debug what S3 returns
      console.log('List Response Contents:', listResponse.Contents);

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

    console.log(`[CLEANUP S3 Successfully completed. Total of ${totalFilesDeleted}`);
    return {
      total_files_deleted: totalFilesDeleted ?? 0,
      bucket_name: BUCKET_NAME ?? 'N/A',
    };
  } catch (error) {
    console.error('[ERROR: Cleaning up S3 Files]', error);
    throw error;
  }
};

// ******** Cleaup Records in DynamoDB *********** //
const cleanupDynamoDB = async () => {
  try {
    // Name of your DynamoDB table from secrets
    const TABLE_NAME = secrets.DYNAMODB_TABLE_NAME;
    let lastEvaluatedKey = undefined; // For paginating through table scans
    let totalItemsDeleted = 0; // Total count of successfully deleted items

    // Helper function to process a batch of delete requests
    // and retry any unprocessed items returned by DynamoDB
    const processBatch = async (batch) => {
      let itemsToProcess = batch; // Items still pending deletion
      let deletedCount = 0; // Counter for this batch

      while (itemsToProcess.length > 0) {
        // Send batch delete request (max 25 items per DynamoDB limit)
        const batchCommand = new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAME]: itemsToProcess,
          },
        });

        const response = await db.send(batchCommand);

        // DynamoDB may return items it couldn't process
        const unprocessed = response.UnprocessedItems?.[TABLE_NAME] ?? [];

        // Count only the items that were actually deleted
        deletedCount += itemsToProcess.length - unprocessed.length;

        // Retry only the unprocessed items in the next loop
        itemsToProcess = unprocessed;

        if (itemsToProcess.length > 0) {
          console.log(`[DB RETRY] Retrying ${itemsToProcess.length} unprocessed items...`);
        }
      }

      // Return the number of items successfully deleted in this batch
      return deletedCount;
    };

    // Main loop: Scan the DynamoDB table in pages
    do {
      const scanCommand = new ScanCommand({
        TableName: TABLE_NAME,
        ProjectionExpression: 'job_id', // Only retrieve the primary key for deletion
        ExclusiveStartKey: lastEvaluatedKey, // Pagination
      });

      const scanResult = await db.send(scanCommand);

      if (scanResult.Items && scanResult.Items.length > 0) {
        // Convert scanned items to DynamoDB delete requests
        const deleteRequests = scanResult.Items.map((item) => ({
          DeleteRequest: { Key: { job_id: item.job_id } },
        }));

        // Split delete requests into chunks of 25 for BatchWriteCommand
        for (let i = 0; i < deleteRequests.length; i += 25) {
          const chunk = deleteRequests.slice(i, i + 25);

          // Process each chunk and retry unprocessed items if needed
          const deleted = await processBatch(chunk);

          // Add successfully deleted items to total count
          totalItemsDeleted += deleted;

          console.log(`[DB] Deleted ${deleted} items in this chunk.`);
        }
      }

      // Prepare for the next scan page
      lastEvaluatedKey = scanResult.LastEvaluatedKey;
    } while (lastEvaluatedKey); // Continue scanning if there are more items

    // Final log after all items have been deleted
    console.log(
      `[CLEANUP DYNAMODB] Successfully completed. Total items deleted: ${totalItemsDeleted}`
    );

    // Return results to use in your email payload
    return {
      total_items_deleted: totalItemsDeleted ?? 0,
      table_name: TABLE_NAME ?? 'N/A',
    };
  } catch (error) {
    // Catch and log any errors
    console.error('[ERROR: Cleaning DynamoDB Records]', error);
    throw error;
  }
};

// ******** Resend Email ******** //
const resendEmailAPI = async (payload) => {
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
             <p style="padding-bottom: 10px; margin-bottom: 15px;">
                <strong>AWS Service:</strong> S3 Bucket, DynamoDB
              </p>
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

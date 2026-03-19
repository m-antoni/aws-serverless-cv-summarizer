// NOTE: AWS Lambda Layers are unzipped into the /opt directory.
// We use '/opt/nodejs' because the Layer ZIP is structured as nodejs/utils/...
// This structure is required so Lambda can also find node_modules automatically.
import { getSecrets } from '/opt/nodejs/utils/secrets.mjs';
import { snsError } from '/opt/nodejs/utils/sns.mjs';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
// import { Upload } from '@aws-sdk/lib-storage';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

// Configure AWS clients
const secrets = await getSecrets();
const dbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({ region: secrets.AWS_REGION_ID });
const lambda = new LambdaClient({ region: secrets.AWS_REGION_ID });

const TABLE_NAME = secrets.DYNAMODB_TABLE_NAME;
const BUCKET_NAME = secrets.S3_BUCKET_NAME;

// ******** MAIN HANDLER *********** //
export const handler = async (event, context) => {
  // Loggin Event
  console.log('[EVENT] ===> ', event);

  // Check if the trigger is from EventBridge Scheduler
  if (event.action !== 'midnight_archive') {
    console.log('Not a midnight archive trigger. Skipping.');
    return;
  }

  try {
    // Fetch all the records
    const scan = await scanTodaysRecords();
    if (!scan) {
      console.log('[NO SCAN RECORDS]', scan);
      return;
    }

    // Archive the records to S3
    const response = await archivedAndCleanupRecords(scan); // args { job_id: "123", key: "uploads/123/" }

    // Invoke the Lambda Cleanup job
    if (response && response.success === true && response?.cleanup_jobs?.total_count > 0) {
      // Trigger Lambda to Purge S3 and DynamoDB
      await triggerCleanupJobs(response);
    } else {
      console.log('[<======= SKIPPED TRIGGER CLEANUP_JOB LAMBDA ======= ]');
    }
  } catch (error) {
    // Sending SNS topic error
    await snsError(error, context);
    console.log('[ERROR] Failed to archived', error);
  }
};

// ******** Scan All Records in DynamoDB *********** //
const scanTodaysRecords = async () => {
  try {
    let allItems = [];
    let lastEvaluatedKey = null;

    do {
      const params = {
        TableName: TABLE_NAME,
        Limit: 200, // Process in chunks of 200 items
      };

      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }

      const response = await dbClient.send(new ScanCommand(params));

      if (response.Items) {
        // for archived
        allItems.push(...response.Items);
      }

      lastEvaluatedKey = response.LastEvaluatedKey;
      // Continue scanning until there are no more keys
    } while (lastEvaluatedKey);

    // extract job_id and key for cleanup items
    const cleanupItems = allItems.map((item) => ({
      job_id: item.job_id,
      key: item?.stage_1_upload.key,
    }));

    return {
      all_items: allItems,
      cleanup_items: cleanupItems,
    };
  } catch (error) {
    console.log(`[ERROR: Failed to Scan all items in table ${TABLE_NAME}]`, error);
  }
};

// ******** Store Records to S3 as JSON file *********** //
const archivedAndCleanupRecords = async ({ all_items, cleanup_items }) => {
  try {
    const now = new Date().toISOString();
    const timestamp = now.split('T')[0]; // Format the timestamp 'YYYY-MM-DD'
    // Keys
    const allItemsKey = `archived-jobs/archived_jobs_${timestamp}_.json`;
    const cleanupKey = `cleanup-jobs/cleanup_job_${timestamp}_.json`;

    // JSON String
    const allItemsJSONString = JSON.stringify(all_items, null, 2);
    const cleanupJSONString = JSON.stringify(cleanup_items, null, 2);

    // Create JSON for Archive Records and  Cleanup Records
    // Optimize for faster Lambda execution, Lower cost, Parallel operations
    const [s3Archive, s3Cleanup] = await Promise.all([
      s3.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: allItemsKey,
          Body: allItemsJSONString, // convert to string
          ContentType: 'application/json; charset=utf-8',
          Metadata: {
            extracted_at: now,
          },
        })
      ),
      s3.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: cleanupKey,
          Body: cleanupJSONString, // convert to string
          ContentType: 'application/json; charset=utf-8',
          Metadata: {
            extracted_at: now,
          },
        })
      ),
    ]);

    console.log('[SUCCESS_RESPONSE: UPLOAD ARCHIVE]', s3Archive);
    console.log('[SUCCESS_RESPONSE: UPLOAD CLEANUP]', s3Cleanup);

    return {
      bucket_name: BUCKET_NAME,
      archived_jobs: {
        key: allItemsKey,
        url: `https://${BUCKET_NAME}.s3.${secrets.AWS_REGION_ID}.amazonaws.com/${allItemsKey}`,
        size: `${(Buffer.byteLength(allItemsJSONString, 'utf8') / 1024).toFixed(2)} KB`,
        total_count: all_items.length,
      },
      cleanup_jobs: {
        key: cleanupKey,
        url: `https://${BUCKET_NAME}.s3.${secrets.AWS_REGION_ID}.amazonaws.com/${cleanupKey}`,
        size: `${(Buffer.byteLength(cleanupJSONString, 'utf8') / 1024).toFixed(2)} KB`,
        total_count: cleanup_items.length,
      },
      success: true, // success process
    };
  } catch (error) {
    console.log('[ERROR Failed to Archive/Cleanup Job]', error);
    throw error;
  }
};

// ******** LambdaInvoke: cleanup-jobs *********** //
const triggerCleanupJobs = async (logs) => {
  try {
    const payloadData = JSON.stringify({
      source: 'cv-summarizer-archive-job-records',
      message: 'Archived & Cleanup successfully completed',
      timestamp: new Date().toISOString(),
      logs,
    });

    const input = {
      FunctionName: 'cv-summarizer-cleanup-job-records',
      InvocationType: 'Event', // Asynchronous "fire and forget"
      Payload: new TextEncoder().encode(payloadData),
    };

    const command = new InvokeCommand(input);
    const response = await lambda.send(command);
    // Log the StatusCode: 202 means "Accepted" (Success for Event types)
    console.log('[SUCCESS]: Cleanup Job Records Triggered ', response);
  } catch (error) {
    console.log('[ERROR: Failed to Invoke Lamdbda Cleanup Records]', error);
  }
};

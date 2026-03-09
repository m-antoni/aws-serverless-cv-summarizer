// NOTE: AWS Lambda Layers are unzipped into the /opt directory.
// We use '/opt/nodejs' because the Layer ZIP is structured as nodejs/utils/...
// This structure is required so Lambda can also find node_modules automatically.
import { getSecrets } from '/opt/nodejs/utils/secrets.mjs';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Resend } from 'resend';

// Configure AWS clients
const secrets = await getSecrets();
const dbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({ region: secrets.AWS_REGION_ID });
// Configure Resent Email API
const resend = new Resend(secrets.RESEND_API_KEY);

const TABLE_NAME = secrets.DYNAMODB_TABLE_NAME;
const BUCKET_NAME = secrets.S3_BUCKET_NAME;

// ******** MAIN HANDLER *********** //
export const handler = async (event) => {
  console.log('[EVENT] ===> ', event);

  // Check if the trigger is from EventBridge Scheduler
  if (event.action !== 'midnight_archive') {
    console.log('Not a midnight archive trigger. Skipping.');
    return;
  }

  // Fetch all the records
  const fetchRecords = await scanAllRecordsInDynamoDB();

  // Archive the records to S3
  const archieve = await archiveRecords(fetchRecords);

  // Purge S3 DynamoDB and S3 Bucket
};

// ******** Scan All Records in DynamoDB *********** //
const scanAllRecordsInDynamoDB = async () => {
  try {
    let allItems = [];
    let lastEvaluatedKey = null;

    do {
      const params = {
        TableName: TABLE_NAME,
        Limit: 100, // Process in chunks of 100 items
      };

      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }

      const command = new ScanCommand(params);

      const response = await dbClient.send(command);

      if (response.Items) {
        allItems.push(...response.Items);
      }

      lastEvaluatedKey = response.LastEvaluatedKey;
      // Continue scanning until there are no more keys
    } while (lastEvaluatedKey);

    return allItems;
  } catch (error) {
    console.log(`[ERROR: Failed to Scan all items in table ${TABLE_NAME}]`, error);
  }
};

// ******** Store Records to S3 as JSON file *********** //
const archiveRecords = async (allItems) => {
  // Get the total count
  const totalCount = allItems.length;

  // Format the timestamp 'YYYY-MM-DD'
  const timestamp = new Date().toISOString().split('T')[0];

  // Convert to string which S3 accepts
  const jsonString = JSON.stringify(allItems, null, 2);

  const uploadRecords = new Upload({
    client: s3,
    params: {
      Bucket: secrets.S3_BUCKET_NAME,
      Key: `archived-jobs/${timestamp}_total_${totalCount}.json`,
      Body: jsonString,
      ContentType: 'application/json; charset=utf-8', // make it json
      Metadata: {
        extracted_at: new Date().toISOString(),
      },
    },
  });

  const s3Response = await uploadRecords.done();
  console.log('[SUCCESS: UPLOAD ARCHIVE RECORDS]', s3Response);

  return {
    key: s3Response.Key,
    url: s3Response.Location,
    length: Buffer.byteLength(jsonString, 'utf8').toString(),
  };
};

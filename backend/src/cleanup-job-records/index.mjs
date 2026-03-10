// NOTE: AWS Lambda Layers are unzipped into the /opt directory.
// We use '/opt/nodejs' because the Layer ZIP is structured as nodejs/utils/...
// This structure is required so Lambda can also find node_modules automatically.
import { getSecrets } from '/opt/nodejs/utils/secrets.mjs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

// Configure AWS clients
const secrets = await getSecrets();
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({ region: secrets.AWS_REGION_ID });

// https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/InvokeCommand/
// ******** MAIN HANDLER *********** //
export const handler = async (event) => {
  // Loggin Event
  console.log('[CLEANUP EVENT] ===> ', event);

  // S3 Cleanup files
  await cleanUpS3();

  // DynamoDB Cleanup records
  await cleanUpDynamoDBTable();
};

// ******** Cleaup files in S3 *********** //
const cleanUpS3 = async () => {
  try {
    const BUCKET_NAME = secrets.S3_BUCKET_NAME;
    const folderPrefix = 'uploads/'; // Ensure this ends with a '/'
    let isTruncated = true;
    let continuationToken;

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

        console.log(`[S3 DELETED: ${objectsToDelete.length} files.`, response);
      }

      isTruncated = listResponse.IsTruncated;
      continuationToken = listResponse.NextContinuationToken;
    }

    return {
      statusCode: 200,
      body: 'S3 Cleanup Complete.',
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

    do {
      // Scan for items (retrieving only the primary key)
      const scanCommand = new ScanCommand({
        TableName: TABLE_NAME,
        ProjectionExpression: 'job_id', // Primary Key name
        ExclusiveStartKey: lastEvaluatedKey,
      });

      const scanResult = await db.send(scanCommand);

      console.log('[DB SCANNED RERSULT:] ====> ', scanResult);

      if (scanResult.Items && scanResult.Items.length > 0) {
        // Prepare Items for BatchWrite
        const deleteRequests = scanResult.Items.map((item) => ({
          DeleteRequest: {
            Key: {
              job_id: item.job_id, // PK id
            },
          },
          // Include your Sort Key here if your table has one
          // "YourSortKeyName": item.YourSortKeyName
        }));

        console.log('[DB REQUEST TO DELETE:] ====> ', deleteRequests);

        // Batch delete in groups of 25
        const batchCommand = new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAME]: deleteRequests,
          },
        });

        console.log('DB BATCH ====> ', batchCommand);

        const response = await db.send(batchCommand);

        console.log(`[DB BatchWriteCommand: Files. ${deleteRequests.length}`, response);
      }

      lastEvaluatedKey = scanResult.LastEvaluatedKey;
    } while (lastEvaluatedKey); // Continue if more items exists
  } catch (error) {
    console.error('[ERROR: Cleaning DynamoDB Records]', error);
    throw error;
  }
};

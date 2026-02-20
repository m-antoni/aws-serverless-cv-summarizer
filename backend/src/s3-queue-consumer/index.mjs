// We use '/opt/nodejs' because the Layer ZIP is structured as nodejs/utils/...
// This structure is required so Lambda can also find node_modules automatically.
import { getSecrets } from '/opt/nodejs/utils/secrets.mjs';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

// Secrets Manager
const secrets = await getSecrets();
// DynamoDB
const dynamodb_client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamodb_client);
// S3
const s3 = new S3Client({});
// SQS (Simple Queue Service)
const sqsClient = new SQSClient({ region: secrets.AWS_REGION_ID });

// ******** Lambda triggered to consume SQS Messages -> use AI -> DynamoDB ******** //
export const handler = async (event) => {
  try {
    console.log('CONSUMER TRIGGERED ====> ', JSON.stringify(event));
    // **** [SQS] poll data
    // **** [S3] look the the file
    // **** [File Parser] parse the file
    // **** [AI]
    // **** [DynamoDB] create new data
  } catch (error) {}
};

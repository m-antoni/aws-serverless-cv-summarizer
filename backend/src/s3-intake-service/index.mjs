// NOTE: AWS Lambda Layers are unzipped into the /opt directory.
// We use '/opt/nodejs' because the Layer ZIP is structured as nodejs/utils/...
// This structure is required so Lambda can also find node_modules automatically.
import { getSecrets } from '/opt/nodejs/utils/secrets.mjs';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { v4 as uuidv4 } from 'uuid';

// Secrets Manager
const secrets = await getSecrets();
// DynamoDB
const dynamodb_client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamodb_client);
// S3
const s3 = new S3Client({});
// SQS (Simple Queue Service)
const sqsClient = new SQSClient({ region: secrets.AWS_REGION_ID });

// ******** S3 UPLOADS TRIGGER -> DYNAMODB -> SQS  ******** //
export const handler = async (event) => {
  try {
    const record = event.Records[0];
    const now = new Date().toISOString();
    const [, user_id, file_name] = event.Records[0].s3.object.key.split('/');

    // file empty
    if (record.s3.object.size === 0) {
      console.error(
        '[EMPTY FILE UPLOADED, PROCESS STOPPED!]',
        JSON.stringify({ file: record.s3.object.key })
      );
      // will delete the record saved in S3 Bucket
      await s3.send(
        new DeleteObjectCommand({
          Bucket: record.s3.bucket.name,
          Key: record.s3.object.key,
        })
      );
      return; // exit Lambda early
    }

    // **** [DynamoDB] create new data
    // Docs: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/PutItemCommand/
    let newItem = {
      job_id: uuidv4(),
      user_id,
      s3_bucket_name: record.s3.bucket.name,
      s3_bucket_arn: record.s3.bucket.arn,
      stage_1_upload: {
        key: record.s3.object.key,
        file_metadata: {
          file_name, // michael.pdf
          format: file_name.split('.').pop().toLowerCase(), // pdf, docx
          size_bytes: record.s3.object.size,
        },
      },
      stage_2_extract: {},
      stage_3_ai: {},
      sqs_meessage: {},
      status: 'IN-PROGRESS',
      ip_address: record.requestParameters.sourceIPAddress,
      created_at: now,
      process_at: null,
    };

    const dbCommand = new PutCommand({ TableName: secrets.DYNAMODB_TABLE_NAME, Item: newItem });
    const dynamodbResponse = await dynamodb.send(dbCommand);

    // **** [SQS] Send Message to Queue
    // Docs: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sqs/command/SendMessageCommand/
    const sqsPayload = {
      QueueUrl: secrets.SQS_QUEUE_URL,
      MessageBody: JSON.stringify(newItem),
      MessageGroupId: 'uploads',
      MessageDeduplicationId: newItem.job_id,
      // MessageAttributes: {
      //   job_id: { DataType: 'String', StringValue: newItem.job_id },
      //   user_id: { DataType: 'String', StringValue: newItem.user_id },
      // },
    };

    const sqsCommand = new SendMessageCommand(sqsPayload);

    const sqsResponse = await sqsClient.send(sqsCommand);

    // Successful logs
    console.log('[SUCCESS] S3 Intake → Metadata stored in DB → Message sent to SQS');
    console.log(
      JSON.stringify({
        STEP_1: {
          title: 'S3 Triggered',
          upload: event.Records[0],
        },
        STEP_2: {
          title: 'Metadata stored in DynamoDB',
          payload: newItem,
          response: dynamodbResponse,
        },
        STEP_3: {
          title: 'Message Sent to SQS',
          payload: sqsPayload,
          response: sqsResponse,
        },
      })
    );
  } catch (error) {
    console.error('[S3_INTAKE_ERROR] Failed to process uploaded file', {
      bucket: event?.Records?.[0]?.s3?.bucket?.name,
      key: event?.Records?.[0]?.s3?.object?.key,
      errorMessage: error.message,
      stack: error.stack,
    });
  }
};

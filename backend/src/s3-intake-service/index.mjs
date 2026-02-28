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
  // For debugging
  console.log('[HANDLER EVENT] ===> ', event);
  console.log('[HANDLER EVENT:userIdentity ] ===> ', JSON.stringify(event.Records[0].userIdentity));
  console.log(
    '[HANDLER EVENT:requestParameters ] ===> ',
    JSON.stringify(event.Records[0].requestParameters)
  );
  console.log(
    '[HANDLER EVENT:responseElements ] ===> ',
    JSON.stringify(event.Records[0].responseElements)
  );
  console.log('[HANDLER EVENT:s3 ] ===> ', JSON.stringify(event.Records[0].s3));

  try {
    const record = event.Records[0];
    const s3Key = record.s3.object.key;

    // [Empty file uploaded, Process Stopped]', exit Lambda early
    if (record.s3.object.size === 0) {
      console.error(JSON.stringify({ file: record.s3.object.key }));
      // will delete the record saved in S3 Bucket
      await s3.send(
        new DeleteObjectCommand({
          Bucket: record.s3.bucket.name,
          Key: record.s3.object.key,
        })
      );
      return;
    }

    // If it's a folder (ends with /), STOP HERE. AWS sends this when the folder structure is created.
    if (s3Key.endsWith('/')) {
      console.log(`[IGNORE] This is a folder event: ${s3Key}`);
      return;
    }

    const now = new Date().toISOString();
    const keyParts = s3Key.split('/');
    const user_id = keyParts[1];
    const file_name = keyParts[2];

    // If file_name is missing, it's not a valid upload
    if (!file_name) {
      console.log(`[IGNORE] File is not in a user folder: ${s3Key}`);
      return;
    }

    const fileNameExtension = file_name.split('.').pop().toLowerCase();

    // Prevent this Lambda from firing when files are uploaded to S3 unless they are primary documents.
    const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'tiff'];
    const isAllowed = allowedExtensions.includes(fileNameExtension);
    if (!isAllowed) {
      console.log(
        `[SKIPPING] Extension .${fileNameExtension} is not supported to trigger this Lambda.`
      );
      return;
    }

    // [DynamoDB] create new data
    // Docs: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/PutItemCommand/
    let newItem = {
      job_id: uuidv4(),
      user_id,
      s3_bucket_name: record.s3.bucket.name,
      s3_bucket_arn: record.s3.bucket.arn,
      stage_1_upload: {
        file_metadata: {
          file_name, // michael.pdf
          format: fileNameExtension, // pdf, docx
          size_bytes: record.s3.object.size,
        },
        key: record.s3.object.key,
        url: `https://${secrets.S3_BUCKET_NAME}.s3.${secrets.AWS_REGION_ID}.amazonaws.com/${record.s3.object.key}`,
      },
      stage_2_document_parsing: {},
      stage_3_ai_summary: {},
      sqs_meessage: {},
      status: 'IN-PROGRESS',
      ip_address: record.requestParameters.sourceIPAddress,
      process_at: record.eventTime,
      created_at: now,
    };

    const dbCommand = new PutCommand({ TableName: secrets.DYNAMODB_TABLE_NAME, Item: newItem });
    const dynamodbResponse = await dynamodb.send(dbCommand);

    // [SQS] Send Message to Queue
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
    console.log(
      '[SUCCESS] S3 Intake → Metadata stored in DB → Message sent to SQS',
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
    const record = event?.Records?.[0]?.s3 || {};
    console.error('[S3_INTAKE_ERROR] Failed to process uploaded file', {
      bucket: record.bucket?.name,
      key: record.object?.key,
      errorMessage: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
  }
};

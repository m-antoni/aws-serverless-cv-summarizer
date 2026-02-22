// We use '/opt/nodejs' because the Layer ZIP is structured as nodejs/utils/...
// This structure is required so Lambda can also find node_modules automatically.
import { getSecrets } from '/opt/nodejs/utils/secrets.mjs';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import {
  TextractClient,
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand, // Necessary for the loop
} from '@aws-sdk/client-textract';

// Secrets Manager
const secrets = await getSecrets();
// DynamoDB
const dynamodb_client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamodb_client);
// S3
const s3 = new S3Client({ region: secrets.AWS_REGION_ID });
// Textract AWS SDK
const textractClient = new TextractClient({ region: secrets.AWS_REGION_ID });

// ******** Lambda triggered to consume SQS Messages -> use AI -> DynamoDB ******** //
export const handler = async (event) => {
  try {
    // **** [SQS] poll data
    const records = event.Records[0];
    const now = new Date().toISOString();
    const body = JSON.parse(records.body);

    const sqsRecord = {
      body,
      sqs_message: {
        message_id: records.messageId,
        receipt_handle: records.receiptHandle,
        arn: records.eventSourceARN,
        attributes: records.attributes,
      },
      received_at: now,
    };

    console.log('CONSUMER DATA ====> ', JSON.stringify(sqsRecord));

    // **** [Client-textract] file reading and parsing
    // Docs: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/textract/command/StartDocumentTextDetectionCommand
    // 1. Start the Job (Supports PDF)
    const startCommand = new StartDocumentTextDetectionCommand({
      DocumentLocation: {
        S3Object: {
          Bucket: body.s3_bucket.bucket_name,
          Name: body.s3_bucket.key,
        },
      },
    });

    const { JobId } = await textractClient.send(startCommand);
    console.log('Async Job Started for PDF. JobId:', JobId);

    // loop the extracted texts
    let finished = false;
    let response;
    while (!finished) {
      console.log('Checking Textract status...');
      response = await textractClient.send(new GetDocumentTextDetectionCommand({ JobId }));
      if (response.JobStatus === 'SUCCEEDED') {
        finished = true;
      } else if (response.JobStatus === 'FAILED') {
        throw new Error('Textract job failed');
      } else {
        // Wait 5 seconds before checking again
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    const extractedText = response.Blocks.filter((block) => block.BlockType === 'LINE')
      .map((block) => block.Text)
      .join('\n');

    console.log('Extracted PDF Text:', extractedText);

    // **** [AI]

    // **** [DynamoDB] create new data
  } catch (error) {
    console.error('[SQS Consumer Error] Failed to poll messages', {
      errorMessage: error.message,
      stack: error.stack,
    });
  }
};

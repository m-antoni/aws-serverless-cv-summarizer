import { getSecrets } from './utils/secrets.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

// secrets
const secrets = await getSecrets();
// DynamoDB
const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);
const tableName = secrets.DYNAMODB_TABLE_NAME;
const s3 = new S3Client({});

// ******** S3 INTAKE TRIGGER LAMBDA ******** //
export const handler = async (event) => {
  try {
    const record = event.Records[0];
    const now = new Date().toISOString();
    const [, user_id, file_name] = event.Records[0].s3.object.key.split('/');

    if (record.s3.object.size === 0) {
      console.warn('EMPTY FILE UPLOADED, PROCESS STOPPED!', record.s3.object.key);
      await s3.send(
        new DeleteObjectCommand({
          Bucket: record.s3.bucket.name,
          Key: record.s3.object.key,
        })
      );
      return; // exit Lambda early
    }

    // create data top dynamoDB
    let newFile = {
      job_id: uuidv4(),
      user_id,
      s3_bucket: {
        name: record.s3.bucket.name,
        arn: record.s3.bucket.arn,
      },
      s3_key: record.s3.object.key,
      status: 'In-Progress',
      file_metadata: {
        file_name, // example.pdf
        format: file_name.split('.').pop(), // .pdf
        size_bytes: record.s3.object.size,
      },
      ai_result: {},
      ip_address: record.requestParameters.sourceIPAddress,
      created_at: now,
      updated_at: now,
    };

    console.log(JSON.stringify(newFile));
    console.log('DYNAMODB TABLE', secrets.DYNAMODB_TABLE_NAME);

    const command = new PutCommand({ TableName: secrets.DYNAMODB_TABLE_NAME, Item: newFile });

    await dynamodb.send(command);

    // Log the success process in table
    const logs = [{ user_id, file_name, created_at: newFile.created_at }];
    console.table(logs);
  } catch (error) {
    console.error('[ERROR]: File read from S3 or DynamoDB Execution error', error);
    // Return a proper HTTP response instead of throwing
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Something went wrong.' }),
    };
  }
};

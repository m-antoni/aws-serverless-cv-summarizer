// We use '/opt/nodejs' because the Layer ZIP is structured as nodejs/utils/...
// This structure is required so Lambda can also find node_modules automatically.
import { getSecrets } from '/opt/nodejs/utils/secrets.mjs';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import {
  TextractClient,
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand,
} from '@aws-sdk/client-textract';
import { Upload } from '@aws-sdk/lib-storage';

// Enum Status
const S3PutStatus = {
  EXTRACTED_RAW: 'EXTRACTED_RAW',
  AI_SUMMARY: 'AI_SUMMARY',
};

// Groq AI
import Groq from 'groq-sdk';

// DynamoDB
const dbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Secrets Manager
const secrets = await getSecrets();

// ******** Lambda Main Handler ****************** //
export const handler = async (event) => {
  try {
    // **** [SQS] poll data
    const records = event.Records[0];
    const body = JSON.parse(records.body);

    console.log('[BODY] ====>', body);
    console.log('[RECORDS] ====>', records);

    // Payload to use for all the process
    const payload = {
      secrets,
      body: {
        user_id: body.user_id,
        job_id: body.job_id,
        s3_bucket_name: body.s3_bucket_name,
        stage_1_upload: body.stage_1_upload,
        sqs_message: {
          arn: records.eventSourceARN,
          message_id: records.messageId,
          message_group_id: records.attributes.MessageGroupId,
          sender_id: records.attributes.SenderId,
          sent_timestamp: records.attributes.SentTimestamp,
          received_count: records.attributes.ApproximateReceiveCount,
          received_at: new Date().toISOString(),
        },
      },
    };

    // [Client-textract] file reading and parsing
    const extractAndUploadToS3Response = await extractAndUploadToS3(payload);

    if (!extractAndUploadToS3Response?.raw_text) {
      throw new Error('Extraction failed: raw_text missing');
    }

    // addinng fields "raw_text", "stage_2_document_parsing"
    payload['raw_text'] = extractAndUploadToS3Response.raw_text;
    payload.body.stage_2_document_parsing = extractAndUploadToS3Response.stage_2_document_parsing;

    // [GROQ AI] to analyze the text
    const useAIToAnalyzeTextResponse = await useAIToAnalyzeText(payload);

    // [DynamoDB] Update the existing data field state_3_ai: { .... }
    payload.body.stage_3_ai_summary = useAIToAnalyzeTextResponse;

    const updateDynamoDBResponse = await updateDB(payload);
  } catch (error) {
    console.error('[SQS Consumer Error] Failed to poll messages', {
      errorMessage: error.message,
      stack: error.stack,
    });
  }
};

// ******** [File Parsing] Extract texts from the file ******** //
// Docs: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/textract/command/StartDocumentTextDetectionCommand
const extractAndUploadToS3 = async (payload) => {
  // Textract AWS SDK
  const textractClient = new TextractClient({ region: secrets.AWS_REGION_ID });
  try {
    // startcommand
    const startCommand = new StartDocumentTextDetectionCommand({
      DocumentLocation: {
        S3Object: {
          Bucket: payload.body.s3_bucket_name,
          Name: payload.body.stage_1_upload.key,
        },
      },
    });

    const { JobId } = await textractClient.send(startCommand);

    // loop the extracted text and attempts
    let response;
    let finished = false;
    let attempts = 0;
    const maxAttempts = 60; // 5 sec * 60 = 5 minutes max
    while (!finished) {
      attempts++;
      response = await textractClient.send(new GetDocumentTextDetectionCommand({ JobId }));
      if (response.JobStatus === 'SUCCEEDED') {
        finished = true;
      } else if (response.JobStatus === 'FAILED') {
        throw new Error('[Textract job failed]');
      } else if (attempts >= maxAttempts) {
        throw new Error('[Textract job timed out]');
      } else {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
    // extracted texts of file
    const raw_text = response.Blocks.filter((block) => block.BlockType === 'LINE')
      .map((block) => block.Text)
      .join('\n');

    console.log('[EXTRACTED PDF,DOC TEXTS] ===> ', raw_text);

    // S3 PutCommand -> Extracted raw text
    payload['raw_text'] = raw_text; // add this to the params
    const stage_2_document_parsing = await uploadToS3Bucket(payload, S3PutStatus.EXTRACTED_RAW);

    // return the extracted text
    return {
      raw_text,
      stage_2_document_parsing,
    };
  } catch (error) {
    console.error('[Extracted File] failed to process and extract the file data', {
      errorMessage: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

// ******** [S3] Save data logs *********** //
const uploadToS3Bucket = async (args, type) => {
  // S3
  const s3 = new S3Client({ region: args.secrets.AWS_REGION_ID });
  let output = {};

  try {
    // timetamp log
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Saved extracted raw text to S3 Bucket
    if (type === S3PutStatus.EXTRACTED_RAW) {
      // Raw Text path will be uploaded
      const s3KeyText = `uploads/${args.body.user_id}/${timestamp}_extracted-text.txt`;

      const upload = new Upload({
        client: s3,
        params: {
          Bucket: args.secrets.S3_BUCKET_NAME,
          Key: s3KeyText,
          Body: args.raw_text, // string, Buffer, or stream
          ContentType: 'text/plain; charset=utf-8',
          Metadata: {
            extracted_at: new Date().toISOString(),
            text_length: args.raw_text.length.toString(),
          },
        },
      });

      const s3Response = await upload.done();
      console.log('[SUCCESS: S3 UPLOAD]: RAW TEXT FROM CV', s3Response);

      // return response
      output = {
        key: s3Response.Key,
        url: s3Response.Location,
        length: args.raw_text.length,
      };
    }

    // Saved AI Summary to S3 Bucket
    if (type === S3PutStatus.AI_SUMMARY) {
      // AI JSON path will be uploaded
      const s3KeyAI = `uploads/${args.body.user_id}/${timestamp}_ai_summary.json`;

      const uploadAIJSON = new Upload({
        client: s3,
        params: {
          Bucket: args.secrets.S3_BUCKET_NAME,
          Key: s3KeyAI,
          Body: args.ai_json_data, // JSON
          ContentType: 'application/json; charset=utf-8', // make it json
          Metadata: {
            extracted_at: new Date().toISOString(),
          },
        },
      });

      const s3AIDataResponse = await uploadAIJSON.done();
      console.log('[SUCCESS: S3 UPLOAD]: AI SUMMARY', s3AIDataResponse);

      // return response
      output = {
        key: s3AIDataResponse.Key,
        url: s3AIDataResponse.Location,
        length: Buffer.byteLength(args.ai_json_data, 'utf8').toString(),
      };
    }

    // returning a string of s3 bucket key
    return output;
  } catch (error) {
    console.error('[S3 Error] failed to upload raw text to s3 bucket', {
      errorMessage: error.message,
      stack: error.stack,
    });
  }
};

// ******** [AI] Use AI to summarize the text *********** //
// Docs: https://console.groq.com/docs/quickstart
const useAIToAnalyzeText = async (payload) => {
  // Validate raw_text
  if (!payload.raw_text) {
    throw new Error('raw_text is undefined before AI processing!');
  }

  // initialize groq AI
  const groq = new Groq({
    apiKey: payload.secrets.AI_API_KEYS,
  });

  try {
    // AI parameters
    const chatCompletion = await groq.chat.completions.create({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [
        {
          role: 'system',
          content: `You are an expert HR Data Scientist. Analyze the CV text and return a strictly formatted JSON object with these keys:
          
          1. 'primary_role': Most accurate professional title.
          2. 'summary': 3-sentence professional overview.
          3. 'skills': { 'technical': [], 'soft': [] }.
          4. 'experience_stats': { 'total_years': number, 'seniority': string }.
          5. 'top_strengths': Array of 3 key strengths.
          6. 'education_summary': Highest degree and institution.
          7. 'certifications': Array of certificate names.
          8. 'contact_details': { 
               'email': string, 
               'linkedin': string,
               'website': string,
               'contact_no': string, // look only for main contact number.
               'location': string // City and Country
             }.
          9. 'rate_score': 1-10 based on impact/clarity.
          10. 'rate_reason': One sentence justification.
          
          Return ONLY JSON.`,
        },
        {
          role: 'user',
          content: payload.raw_text,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1, // Lowered for maximum precision
    });

    // Parse the AI's JSON response
    const aiData = JSON.parse(chatCompletion.choices[0].message.content);

    const finalOutput = {
      status: 'success',
      data: aiData,
      metadata: {
        model: chatCompletion.model,
        usage: chatCompletion.usage,
        timestamp: new Date().toISOString(),
      },
    };

    // OUTPUT AI DATA
    console.log('[GROQ AI ANALYZE OUTPUT]: ', JSON.stringify(finalOutput, null, 2));

    payload.ai_json_data = JSON.stringify(finalOutput, null, 2);

    // Upload AI response as JSON format to S3 Bucket
    const AIUploadToS3Response = await uploadToS3Bucket(payload, S3PutStatus.AI_SUMMARY);
    // return JSON.stringify(finalOutput, null, 2);

    return AIUploadToS3Response;
  } catch (error) {
    console.error('[AI Assistant] failed to summarize the text', {
      errorMessage: error.message,
      stack: error.stack,
    });
    throw new Error('AI failed to analyze the text');
  }
};

// ******** [DynamoDB] Update the existing field in table *********** //
const updateDB = async (payload) => {
  try {
    const params = {
      TableName: payload.secrets.DYNAMODB_TABLE_NAME,
      Key: { job_id: payload.body.job_id },
      UpdateExpression: 'SET #s = :s, #stg2 = :stg2, #stg3 = :stg3, #sqs = :sqs, #u = :u',
      ExpressionAttributeNames: {
        '#s': 'status',
        '#stg2': 'stage_2_document_parsing',
        '#stg3': 'stage_3_ai_summary',
        '#sqs': 'sqs_message',
        '#u': 'updated_at',
      },
      ExpressionAttributeValues: {
        ':s': 'COMPLETED',
        ':stg2': payload.body.stage_2_document_parsing,
        ':stg3': payload.body.stage_3_ai_summary,
        ':sqs': payload.body.sqs_message,
        ':u': new Date().toISOString(),
      },
      ReturnValues: 'UPDATED_NEW',
    };

    const updateCommand = new UpdateCommand(params);

    const data = await dbClient.send(updateCommand);

    console.log('[DYNAMO DB UPDATE COMMAND]: ', JSON.stringify(data));
  } catch (error) {
    console.error('[DynamoDB] failed to update the existing field state_3_ai', {
      errorMessage: error.message,
      stack: error.stack,
    });
  }
};

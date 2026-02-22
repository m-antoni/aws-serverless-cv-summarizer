// We use '/opt/nodejs' because the Layer ZIP is structured as nodejs/utils/...
// This structure is required so Lambda can also find node_modules automatically.
import { getSecrets } from '/opt/nodejs/utils/secrets.mjs';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import {
  TextractClient,
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand, // Necessary for the loop
} from '@aws-sdk/client-textract';
import { Upload } from '@aws-sdk/lib-storage';
const s3PutStatus = {
  EXTRACTED_RAW: 'EXTRACTED_RAW',
  AI_SUMMARY: 'AI_SUMMARY',
};

import Groq from 'groq-sdk';

// DynamoDB
// const dynamodb_client = new DynamoDBClient({});
// const dynamodb = DynamoDBDocumentClient.from(dynamodb_client);

// ******** Lambda Main Handler ****************** //
export const handler = async (event) => {
  const now = new Date().toISOString();
  // Secrets Manager
  const secrets = await getSecrets();
  try {
    // **** [SQS] poll data
    const records = event.Records[0];
    const body = JSON.parse(records.body);

    console.log('BODY ====>', body);

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

    console.log('[SQS CONSUMER DATA] ===> ', JSON.stringify(sqsRecord));

    // **** [Client-textract] file reading and parsing

    const extractParams = { secrets, body };
    const extractedResponse = await extractAndUploadToS3(extractParams);

    //  [S3] Saved the extracted texts

    // [AI]

    // [DynamoDB] create new data
  } catch (error) {
    console.error('[SQS Consumer Error] Failed to poll messages', {
      errorMessage: error.message,
      stack: error.stack,
    });
  }
};

// ******** [File Parsing] Extract texts from the file ******** //
const extractAndUploadToS3 = async (args) => {
  // Docs: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/textract/command/StartDocumentTextDetectionCommand
  // Textract AWS SDK
  const textractClient = new TextractClient({ region: args.secrets.AWS_REGION_ID });
  try {
    // startcommand
    const startCommand = new StartDocumentTextDetectionCommand({
      DocumentLocation: {
        S3Object: {
          Bucket: args.body.s3_bucket_name,
          Name: args.body.stage_1_upload.key,
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
    const rawText = response.Blocks.filter((block) => block.BlockType === 'LINE')
      .map((block) => block.Text)
      .join('\n');

    console.log('[EXTRACTED PDF,DOC TEXTS] ===> ', rawText);

    // S3 PutCommand -> Extracted raw text
    args['rawText'] = rawText; // add this to the params
    await uploadToS3Bucket(args, s3PutStatus.EXTRACTED_RAW);

    // [GROQ AI] to analyze the text
    await useAIToAnalyzeText(rawText, args.secrets);
  } catch (error) {
    console.error('[Extracted File] failed to process and extract the file data', {
      errorMessage: error.message,
      stack: error.stack,
    });
  }
};

// ******** [S3] Save extracted raw data *********** //
const uploadToS3Bucket = async (args, type) => {
  // S3
  const s3 = new S3Client({ region: args.secrets.AWS_REGION_ID });

  try {
    // Saved extracted raw text to S3 Bucket
    if (type === s3PutStatus.EXTRACTED_RAW) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const s3Key = `uploads/${args.body.user_id}/${timestamp}_extracted-text.txt`;

      const upload = new Upload({
        client: s3,
        params: {
          Bucket: args.secrets.S3_BUCKET_NAME,
          Key: s3Key,
          Body: args.rawText, // string, Buffer, or stream
          ContentType: 'text/plain; charset=utf-8',
          Metadata: {
            extracted_at: new Date().toISOString(),
            text_length: args.rawText.length.toString(),
          },
        },
      });

      const s3Response = await upload.done();
      console.log('[SUCCESS: S3 UPLOAD]', s3Response);
    }

    // Saved AI Summary to S3 Bucket
    if (type === s3PutStatus.AI_SUMMARY) {
    }
  } catch (error) {
    console.error('[S3 Error] failed to upload raw text to s3 bucket', {
      errorMessage: error.message,
      stack: error.stack,
    });
  }
};

// ******** [AI] use ai to summarize the text *********** //
// Docs: https://console.groq.com/docs/quickstart
const useAIToAnalyzeText = async (text, secrets) => {
  // initialize groq AI
  const groq = new Groq({
    apiKey: secrets.AI_API_KEYS,
  });

  try {
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
          content: text,
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
  } catch (error) {
    console.log(
      JSON.stringify(
        {
          status: 'error',
          message: error.message,
          code: error.status || 500,
        },
        null,
        2
      )
    );
  }
};

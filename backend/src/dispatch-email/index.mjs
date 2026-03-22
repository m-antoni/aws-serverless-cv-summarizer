// NOTE: AWS Lambda Layers are unzipped into the /opt directory.
// We use '/opt/nodejs' because the Layer ZIP is structured as nodejs/utils/...
// This structure is required so Lambda can also find node_modules automatically.
import { getSecrets } from '/opt/nodejs/utils/secrets.mjs';
import { snsError } from '/opt/nodejs/utils/sns.mjs';
import { initRedis } from '/opt/nodejs/utils/redis.mjs';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import nodemailer from 'nodemailer';

// Configure AWS clients
const secrets = await getSecrets();
const dbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({ region: secrets.AWS_REGION_ID });

const redis = await initRedis();

// ******** MAIN HANDLER ******** //
export const handler = async (event, context) => {
  // Lambda Event Invoke
  if (event.source !== 'cv-summarizer-s3-queue-consumer' || !event?.success) {
    console.log('NOT TRIGGER SKIPPING!!!', event);
    return;
  }
  console.log('[EVENT] ===> ', JSON.stringify(event, null, 2));

  try {
    const payload = event.logs;
    const redisKey = `job:${payload.job_id}`;

    // Lock it in Redis so no other Lambda can start
    const lock = await redis.set(redisKey, 'processing', { nx: true, ex: 300 });
    if (!lock) return;

    // Get S3 data
    const s3Response = await readS3File(payload.stage_3_ai_summary.key);

    // Send the email (Slow part)
    const sendEmailResponse = await sendEmail(
      { email: payload.email, created_at: payload.created_at },
      s3Response
    );

    // Update the DB (Final part)
    const updateDB = await updateDynamoDB(payload.job_id);

    // Update Redis
    await redis.set(
      redisKey,
      {
        job_id: payload.job_id,
        user_id: payload.user_id,
        email_sent: sendEmailResponse.success,
        dynamodb_update: updateDB,
      },
      { ex: 3600 } // expires in 1hr
    );
  } catch (error) {
    // Sending SNS topic error
    await snsError(error, context);
    await redis.del(`job:${event.logs.job_id}`);
    console.log('[ERROR] Failed to dispatch email', error);
  }
};

// ******** Read S3 object and convert its body to a string ******** //
// Docs: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/
const readS3File = async (key) => {
  // S3 bucket name
  const S3_BUCKET_NAME = secrets.S3_BUCKET_NAME;

  try {
    const command = new GetObjectCommand({ Bucket: S3_BUCKET_NAME, Key: key });
    const response = await s3.send(command);
    const rawContent = await response.Body.transformToString();
    const jsonData = JSON.parse(rawContent);
    // logging
    console.log('[READ FILE S3]', jsonData);

    return jsonData;
  } catch (error) {
    console.log(`[Error: reading S3 file ${key}]:`, error);
    throw error;
  }
};

// ******** Nodemailer: use to send email ******** //
const sendEmail = async ({ email, created_at }, content) => {
  try {
    const endTime = Date.now();
    const startTime = new Date(created_at).getTime();
    const totalSeconds = Math.floor((endTime - startTime) / 1000);

    let durationText;
    if (totalSeconds >= 60) {
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      durationText = `${minutes}m ${seconds}s`;
    } else {
      durationText = `${totalSeconds}s`;
    }
    console.log(`[PROCESS LATENCY BEFORE EMAIL] Total duration: ${durationText}`);

    // Configure Nodemailer
    const transporter = nodemailer.createTransport({
      host: secrets.SMTP_HOST,
      port: Number(secrets.SMTP_PORT),
      secure: secrets.SMTP_SECURE === 'true',
      auth: {
        user: secrets.SMTP_USER,
        pass: secrets.SMTP_PASS,
      },
    });

    // Send Email Notification
    const info = await transporter.sendMail({
      from: `"AWS Serverless CV Summarizer" <noreply@cv-summarizer.dev>`,
      to: email,
      subject: `[AWS Serverless CV Summarizer] Email Notification`,
      text: `Michael Antoni`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; border: 1px solid #ddd; border-radius: 3px; overflow: hidden;">
            <div style="background-color: #121212; color: white; padding: 15px; text-align: center;">
                <h2 style="margin: 0; font-size: 18px;">AWS Serverless CV Summarizer</h2>
            </div>
            <div style="padding: 20px;">
                <p style="margin: 0; padding: 0;">
                  <strong>AI: </strong> Powered by Groq (LPU)
                    <a href="https://groq.com" style="color: #007BFF; text-decoration: none;">https://groq.com</a>
                </p>
                <p style="margin: 0; padding: 0;">
                  <strong>Model: </strong> ${content.metadata.model}
                </p>
                <p style="margin: 0; padding: 0;">
                  <strong>Duration: </strong> ${durationText}
                </p>
                <p style="border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 15px;">
                  <strong>Date :</strong> ${new Date().toLocaleString('en-US', {
                    timeZone: 'Asia/Manila',
                  })}
                </p>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                  <tr>
                      <td style="padding: 8px 0; width: 160px;"><strong>Primary Role:</strong></td>
                      <td style="padding: 8px 0;">${content.data.candidate}</td>
                  </tr>
                  <tr>
                      <td style="padding: 8px 0; width: 160px;"><strong>Primary Role:</strong></td>
                      <td style="padding: 8px 0;">${content.data.primary_role}</td>
                  </tr>
                  <tr>
                      <td style="padding: 8px 0; width: 160px;"><strong>Summary:</strong></td>
                      <td style="padding: 8px 0;">${content.data.summary}</td>
                  </tr>
                  <tr>
                      <td style="padding: 8px 0; width: 160px;"><strong>Tech Skills:</strong></td>
                      <td style="padding: 8px 0;">${
                        content.data.skills.technical?.join(', ') || 'n/a'
                      }</td>
                  </tr>
                  <tr>
                      <td style="padding: 8px 0; width: 140px;"><strong>Soft Skills:</strong></td>
                      <td style="padding: 8px 0;">${
                        content.data.skills.soft?.join(', ') || 'n/a'
                      }</td>
                  </tr>
                  <tr>
                      <td style="padding: 8px 0; width: 160px;"><strong>Total Years Experience:</strong></td>
                      <td style="padding: 8px 0;">${content.data.experience_stats.total_years}</td>
                  </tr>
                  <tr>
                      <td style="padding: 8px 0; width: 160px;"><strong>Top Strengths:</strong></td>
                      <td style="padding: 8px 0;">${
                        content.data.top_strengths?.join(', ') || ''
                      }</td>
                  </tr>
                  <tr>
                      <td style="padding: 8px 0; width: 160px;"><strong>Education:</strong></td>
                      <td style="padding: 8px 0;">${content.data.education_summary || 'n/a'}</td>
                  </tr>
                  <tr>
                      <td style="padding: 8px 0; width: 160px;"><strong>Certifications:</strong></td>
                      <td style="padding: 8px 0;">${
                        content.data.certifications?.join(', ') || 'n/a'
                      }</td>
                  </tr>
                  <tr>
                      <td style="padding: 8px 0; width: 160px;"><strong>Contact Details:</strong></td>
                      <td style="padding: 8px 0;">
                        <table border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
                            <tr>
                              <td style="padding: 2px 0;">Email: ${
                                content.data.contact_details.email || 'n/a'
                              }</td>
                            </tr>
                            <tr>
                              <td style="padding: 2px 0;">Contact No: ${
                                content.data.contact_details.contact_no || 'n/a'
                              }</td>
                            </tr>
                            <tr>
                              <td style="padding: 2px 0;">Website: ${
                                content.data.contact_details.website || 'n/a'
                              }</td>
                            </tr>
                        </table>
                      </td>
                  </tr>
                  <tr>
                      <td style="padding: 8px 0; width: 160px;"><strong>Rate Score:</strong></td>
                      <td style="padding: 8px 0;">${content.data.rate_score}/10</td>
                  </tr>
                  <tr>
                      <td style="padding: 8px 0; width: 160px;"><strong>Rate Reason:</strong></td>
                      <td style="padding: 8px 0;">${content.data.rate_reason}</td>
                  </tr>
                </table>
            </div>
            <div style="background-color: #f1f1f1; color: #6c757d; padding: 10px; text-align: center; font-size: 12px;">
                Automated notification via Nodemailer
            </div>
          </div>
        `,
    });

    return {
      success: true,
      info,
    };
  } catch (error) {
    console.log('[ERROR Nodemailer failed to send email notification.]', error);
    return {
      success: false,
    };
  }
};

// ******** Update Dynamo DB ******** //
// Docs: https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_dynamodb_code_examples.html
const updateDynamoDB = async (jobID) => {
  try {
    const command = new UpdateCommand({
      TableName: secrets.DYNAMODB_TABLE_NAME,
      Key: { job_id: jobID },
      // 1. Flip the status to true and set the timestamp
      UpdateExpression: 'SET #es = :true, #esa = :now',
      // 2. The Logic: Only proceed if it's currently false OR doesn't exist yet
      ConditionExpression: '#es = :false OR attribute_not_exists(#es)',
      ExpressionAttributeNames: {
        '#es': 'email_sent',
        '#esa': 'email_sent_at',
      },
      ExpressionAttributeValues: {
        ':true': true,
        ':false': false, // This allows the "flip" from false to true
        ':now': new Date().toISOString(),
      },
      ReturnValues: 'ALL_NEW',
    });

    const data = await dbClient.send(command);
    console.log('[DYNAMO DB UPDATE SUCCESS]: ', JSON.stringify(data.Attributes));
    return true;
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      // This means email_sent was already true
      console.log(`[IDEMPOTENT] DB already marked as sent for job: ${jobID}`);
      return false;
    }

    console.error('[DYNAMO DB ERROR]:', error);
    throw error;
  }
};

// NOTE: AWS Lambda Layers are unzipped into the /opt directory.
// We use '/opt/nodejs' because the Layer ZIP is structured as nodejs/utils/...
// This structure is required so Lambda can also find node_modules automatically.
import { getSecrets } from '/opt/nodejs/utils/secrets.mjs';
import { snsError } from '/opt/nodejs/utils/sns.mjs';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import nodemailer from 'nodemailer';

// Configure AWS clients
const secrets = await getSecrets();
const dbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({ region: secrets.AWS_REGION_ID });

// ******** MAIN HANDLER ******** //
export const handler = async (event, context) => {
  console.log('[EVENT] ===> ', JSON.stringify(event, null, 2));

  try {
    // get the NewImage from the event record
    const rawImage = event.Records[0].dynamodb.NewImage;

    // transform to a clean object
    const imageObj = unmarshall(rawImage);
    const payload = {
      job_id: imageObj.job_id,
      user_id: imageObj.user_id,
      email: imageObj.email,
      email_sent: imageObj.email_sent,
      stage_1_upload: imageObj.stage_1_upload,
      stage_2_document_parsing: imageObj.stage_2_document_parsing,
      stage_3_ai_summary: imageObj.stage_3_ai_summary,
      status: imageObj.status,
      created_at: imageObj.created_at,
    };
    // console.log('[PAYLOAD] ===> ', JSON.stringify(payload, null, 2));

    // Read content of stage2 and stage3 form S3 Bucket
    const response = await readS3File(payload.stage_3_ai_summary.key);

    // Update DynamoDB
    const updateDB = await updateDynamoDB(payload.job_id);

    if (!updateDB) {
      console.log('[EMAIL already sent. skipping...]');
      return;
    }

    // Send notification email using Resent API
    await sendEmail(payload.email, response);
  } catch (error) {
    // Sending SNS topic error
    await snsError(error, context);
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
const sendEmail = async (email, content) => {
  try {
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
                  <strong>Duration: </strong> ${content.data.duration}
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
    throw error;
  }
};

// ******** Update Dynamo DB ******** //
// Docs: https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_dynamodb_code_examples.html
const updateDynamoDB = async (jobID) => {
  // update if the email send is successful
  try {
    const params = {
      TableName: secrets.DYNAMODB_TABLE_NAME,
      Key: { job_id: jobID },
      UpdateExpression: 'SET  #es = :es, #esa = :esa',
      // Condition prevents overwriting if already sent
      ConditionExpression: 'attribute_not_exists(email_sent) OR email_sent = :false',
      ExpressionAttributeNames: {
        '#es': 'email_sent',
        '#esa': 'email_sent_at',
      },
      ExpressionAttributeValues: {
        ':es': true,
        ':esa': new Date().toISOString(),
        ':false': false,
      },
      ReturnValues: 'UPDATED_NEW',
    };

    const command = new UpdateCommand(params);

    const data = await dbClient.send(command);

    console.log('[DYNAMO DB UPDATE COMMAND]: ', JSON.stringify(data));

    return true;
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      console.log(`[DynamoDB] Update skipped: Email already sent for job ${jobID}`, error);
      return false;
    }

    console.error('[DynamoDB] failed to update:', error);
    throw error;
  }
};

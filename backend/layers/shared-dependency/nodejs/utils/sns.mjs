import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { getSecrets } from './secrets.mjs';

// Configure AWS clients
const secrets = await getSecrets();
const sns = new SNSClient({ region: secrets.AWS_REGION_ID });

export const snsError = async (error, context) => {
  try {
    await sns.send(
      new PublishCommand({
        Subject: `SNS Alert: Error in ${context.functionName}`,
        Message: `Function Name: ${context.functionName}\n\nError: ${error.message}\n\nStack: ${error.stack}`,
        TopicArn: secrets.SNS_ERROR_TOPIC_ARN,
      })
    );
  } catch (snsError) {
    console.log('[SNS ERROR Failed to send SNS Error Topic]:', snsError);
  }
};

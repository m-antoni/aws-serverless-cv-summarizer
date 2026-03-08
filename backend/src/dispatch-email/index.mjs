import { Resend } from 'resend';

export const handler = async (event) => {
  console.log('[EVENT] ===> ', JSON.stringify(event, null, 2));

  // const resend = new Resend(process.env.RESEND_API_KEY);
  // await resend.emails.send({
  //   from: 'onboarding@resend.dev',
  //   to: 'michaelantoni.tech@gmail.com',
  //   subject: 'FROM DISPATCH EMAIL LAMBDA',
  //   html: '<p>This is a test email!</p>',
  // });

  // TODO implement
  const response = {
    statusCode: 200,
    body: JSON.stringify('[DISPATCH EMAIL]'),
  };
  return response;
};

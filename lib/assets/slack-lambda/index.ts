import { IncomingWebhook } from '@slack/webhook';

const { SLACK_WEBHOOK_URL } = process.env;

export const handler = async (event: any): Promise<void> => {
  if (SLACK_WEBHOOK_URL) {
    const message = event.Records[0].Sns.Message;
    const webhook = new IncomingWebhook(SLACK_WEBHOOK_URL);

    try {
      await webhook.send({ text: message });
    } catch (error) {
      console.error(`Error sending message to Slack: ${error}`);
    }
  }
};

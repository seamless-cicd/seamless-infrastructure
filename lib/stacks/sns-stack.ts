import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { SubscriptionProtocol, Topic } from 'aws-cdk-lib/aws-sns';
import {
  EmailSubscription,
  LambdaSubscription,
  UrlSubscription,
} from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

import {
  EMAIL_ADDRESS,
  SLACK_WEBHOOK_URL,
  SNS_SUBSCRIBER_URL,
} from '../constants';

export class SnsStack extends NestedStack {
  readonly topic: Topic;

  constructor(scope: Construct, id: string, props?: NestedStackProps) {
    super(scope, id, props);

    // Create an SNS topic
    this.topic = new Topic(this, 'SeamlessTopic');

    // Subscribe an HTTP endpoint to this topic
    // Requires confirmation by the user
    if (SNS_SUBSCRIBER_URL) {
      const urlSubscription = new UrlSubscription(SNS_SUBSCRIBER_URL, {
        protocol: SubscriptionProtocol.HTTPS,
      });
      this.topic.addSubscription(urlSubscription);
    }

    // Subscribe an email address to this topic
    // Requires confirmation by the user
    if (EMAIL_ADDRESS) {
      const emailSubscription = new EmailSubscription(EMAIL_ADDRESS);
      this.topic.addSubscription(emailSubscription);
    }

    // Subscribe a Lambda function to this topic
    if (SLACK_WEBHOOK_URL) {
      const slackLambdaFunction = new Function(
        this,
        'SeamlessSlackNotificationLambdaFunction',
        {
          runtime: Runtime.NODEJS_14_X,
          handler: 'index.handler',
          code: Code.fromAsset('./lib/assets/slack-lambda'),
          environment: {
            SLACK_WEBHOOK_URL,
          },
        },
      );
      const slackLambdaSubscription = new LambdaSubscription(
        slackLambdaFunction,
      );
      this.topic.addSubscription(slackLambdaSubscription);
    }
  }
}

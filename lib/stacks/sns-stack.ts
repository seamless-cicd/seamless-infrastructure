import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import { UrlSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { SubscriptionProtocol } from 'aws-cdk-lib/aws-sns';

import { config } from 'dotenv';
config();

import { SNS_SUBSCRIBER_URL } from '../constants';

export class SnsStack extends NestedStack {
  readonly topic: Topic;

  constructor(scope: Construct, id: string, props?: NestedStackProps) {
    super(scope, id, props);

    // Prop validation
    if (!SNS_SUBSCRIBER_URL) {
      throw new Error('SNS subscriber url not found');
    }

    // Create an SNS topic
    this.topic = new Topic(this, 'seamless-pipeline-topic');

    // Subscribe an HTTP endpoint to this topic
    const urlSubscription = new UrlSubscription(SNS_SUBSCRIBER_URL, {
      protocol: SubscriptionProtocol.HTTPS,
    });
    this.topic.addSubscription(urlSubscription);
  }
}

import * as cdk from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import { SNS_TOPIC_NAME } from '../constants';

export interface SnsStackProps extends cdk.NestedStackProps {
  snsSubscriberUrl: string | undefined;
}

export class SnsStack extends cdk.NestedStack {
  topic: sns.Topic;

  constructor(scope: Construct, id: string, props?: SnsStackProps) {
    super(scope, id, props);

    // Prop validation
    if (!props?.snsSubscriberUrl) {
      throw new Error('Sns subscriber url not found');
    }

    // Create an SNS topic
    const topic = new sns.Topic(this, SNS_TOPIC_NAME);

    // Subscribe an HTTP endpoint to this topic
    const urlSubscription = new subs.UrlSubscription(props.snsSubscriberUrl);
    topic.addSubscription(urlSubscription);

    this.topic = topic;
  }
}

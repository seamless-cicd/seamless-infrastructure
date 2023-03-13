import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import { UrlSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';

export interface SnsStackProps extends NestedStackProps {
  readonly snsSubscriberUrl: string | undefined;
}

export class SnsStack extends NestedStack {
  readonly topic: Topic;

  constructor(scope: Construct, id: string, props?: SnsStackProps) {
    super(scope, id, props);

    // Prop validation
    if (!props?.snsSubscriberUrl) {
      throw new Error('Sns subscriber url not found');
    }

    // Create an SNS topic
    this.topic = new Topic(this, 'seamless-pipeline-topic');

    // Subscribe an HTTP endpoint to this topic
    const urlSubscription = new UrlSubscription(props.snsSubscriberUrl);
    this.topic.addSubscription(urlSubscription);
  }
}

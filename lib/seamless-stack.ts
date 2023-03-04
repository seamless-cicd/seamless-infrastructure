import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EcsStack } from './stacks/ecs-stack';
import { SnsStack } from './stacks/sns-stack';
import { StateMachineStack } from './stacks/state-machine-stack';
import { VpcStack } from './stacks/vpc-stack';

import { config } from 'dotenv';
import { RdsStack } from './stacks/rds-stack';
config();

export class SeamlessStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC
    const vpcStack = new VpcStack(this, 'seamless-vpc');

    // SNS
    const snsStack = new SnsStack(this, 'seamless-sns', {
      snsSubscriberUrl: process.env.SNS_SUBSCRIBER_URL,
    });

    const ecsStack = new EcsStack(this, 'seamless-ecs', {
      vpc: vpcStack.vpc,
    });

    ecsStack.addDependency(vpcStack);

    // const rdsStack = new RdsStack(this, 'seamless-rds', {
    //   vpc: vpcStack.vpc,
    // });

    // State machine
    const stateMachineStack = new StateMachineStack(
      this,
      'seamless-state-machine',
      {
        topic: snsStack.topic,
        ecsCluster: ecsStack.cluster,
        sampleSuccessTaskDefinition: ecsStack.sampleSuccessTaskDefinition,
        sampleFailureTaskDefinition: ecsStack.sampleFailureTaskDefinition,
        prepareTaskDefinition: ecsStack.prepareTaskDefinition,
        codeQualityTaskDefinition: ecsStack.codeQualityTaskDefinition,
        testTaskDefinition: ecsStack.testTaskDefinition,
        buildTaskDefinition: ecsStack.buildTaskDefinition,
        deployTaskDefinition: ecsStack.deployTaskDefinition,
      }
    );

    stateMachineStack.addDependency(snsStack);
    stateMachineStack.addDependency(ecsStack);
    // stateMachineStack.addDependency(rdsStack);
  }
}

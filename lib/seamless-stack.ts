import { Stack, StackProps } from 'aws-cdk-lib';
import { VpcStack } from './stacks/vpc-stack';
import { EfsStack } from './stacks/efs-stack';
import { SnsStack } from './stacks/sns-stack';
import { EcsStack } from './stacks/ecs-stack';
import { StateMachineStack } from './stacks/state-machine-stack';
import { RdsStack } from './stacks/rds-stack';
import { Construct } from 'constructs';

import { config } from 'dotenv';
config();

export class SeamlessStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    // VPC
    const vpcStack = new VpcStack(this, 'seamless-vpc');

    // EFS
    const efsStack = new EfsStack(this, 'seamless-efs', { vpc: vpcStack.vpc });
    efsStack.addDependency(vpcStack);

    // SNS
    const snsStack = new SnsStack(this, 'seamless-sns', {
      snsSubscriberUrl: process.env.SNS_SUBSCRIBER_URL,
    });

    // ECS
    const ecsStack = new EcsStack(this, 'seamless-ecs', {
      vpc: vpcStack.vpc,
    });

    ecsStack.addDependency(vpcStack);

    // RDS
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

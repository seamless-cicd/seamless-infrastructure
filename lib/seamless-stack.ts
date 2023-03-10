import { Stack, StackProps } from 'aws-cdk-lib';
import { VpcStack } from './stacks/vpc-stack';
import { EfsStack } from './stacks/efs-stack';
import { SnsStack } from './stacks/sns-stack';
import { EcsTasksStack } from './stacks/ecs-tasks-stack';
import { StateMachineStack } from './stacks/state-machine-stack';
import { RdsStack } from './stacks/rds-stack';
import { ElastiCacheStack } from './stacks/elasticache-stack';
import { EcsBackendStack } from './stacks/ecs-backend-stack';
import { ApiGatewayStack } from './stacks/api-gateway-stack';
import { Construct } from 'constructs';

import { config } from 'dotenv';
config();

export class SeamlessStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    // VPC
    const vpcStack = new VpcStack(this, 'SeamlessVpc');

    // EFS
    const efsStack = new EfsStack(this, 'SeamlessEfs', { vpc: vpcStack.vpc });

    efsStack.addDependency(vpcStack);

    // SNS
    const snsStack = new SnsStack(this, 'SeamlessSns', {
      snsSubscriberUrl: process.env.SNS_SUBSCRIBER_URL,
    });

    // ECS
    const ecsTasksStack = new EcsTasksStack(this, 'SeamlessEcs', {
      vpc: vpcStack.vpc,
      efs: efsStack.efs,
    });

    ecsTasksStack.addDependency(vpcStack);

    // RDS
    const rdsStack = new RdsStack(this, 'SeamlessRds', {
      vpc: vpcStack.vpc,
    });

    // Seamless backend stack
    const ecsBackendStack = new EcsBackendStack(this, 'SeamlessBackend', {
      vpc: vpcStack.vpc,
      rdsInstance: rdsStack.rdsInstance,
    });

    ecsBackendStack.addDependency(rdsStack);

    // ElastiCache
    const elastiCacheStack = new ElastiCacheStack(this, 'SeamlessElastiCache', {
      vpc: vpcStack.vpc,
    });

    elastiCacheStack.addDependency(vpcStack);

    const apiGateway = new ApiGatewayStack(this, 'SeamlessAPIGateway', {
      vpc: vpcStack.vpc,
      fargate: ecsBackendStack.fargate,
    });

    // State machine
    const stateMachineStack = new StateMachineStack(
      this,
      'SeamlessStateMachine',
      {
        topic: snsStack.topic,
        ecsCluster: ecsTasksStack.cluster,
        rdsInstance: rdsStack.rdsInstance,
        vpc: vpcStack.vpc,
        sampleSuccessTaskDefinition: ecsTasksStack.sampleSuccessTaskDefinition,
        sampleFailureTaskDefinition: ecsTasksStack.sampleFailureTaskDefinition,
        prepareTaskDefinition: ecsTasksStack.prepareTaskDefinition,
        codeQualityTaskDefinition: ecsTasksStack.codeQualityTaskDefinition,
        unitTestTaskDefinition: ecsTasksStack.unitTestTaskDefinition,
        buildTaskDefinition: ecsTasksStack.buildTaskDefinition,
        integrationTestTaskDefinition:
          ecsTasksStack.integrationTestTaskDefinition,
        deployStagingTaskDefinition: ecsTasksStack.deployStagingTaskDefinition,
        deployProdTaskDefinition: ecsTasksStack.deployProdTaskDefinition,
      }
    );

    stateMachineStack.addDependency(snsStack);
    stateMachineStack.addDependency(ecsTasksStack);
    stateMachineStack.addDependency(rdsStack);
    stateMachineStack.addDependency(ecsBackendStack);
    stateMachineStack.addDependency(apiGateway);
  }
}

import { Stack, StackProps, CfnOutput, Fn } from 'aws-cdk-lib';
import { VpcStack } from './stacks/vpc-stack';
import { EfsStack } from './stacks/efs-stack';
import { SnsStack } from './stacks/sns-stack';
import { EcsTasksStack } from './stacks/ecs-tasks-stack';
import { StateMachineStack } from './stacks/state-machine-stack';
import { RdsStack } from './stacks/rds-stack';
import { ElastiCacheStack } from './stacks/elasticache-stack';
import { EcsBackendStack } from './stacks/ecs-backend-stack';
import { ApiGatewayStack } from './stacks/api-gateway-stack';
import { Ec2BastionHostStack } from './stacks/ec2-bastion-host-stack';
import { DemoFargateStack } from './stacks/demo-fargate-stack';
import { Construct } from 'constructs';

export class SeamlessStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    // VPC
    const vpcStack = new VpcStack(this, 'SeamlessVpc');

    // EC2 bastion host
    const ec2BastionHostStack = new Ec2BastionHostStack(
      this,
      'SeamlessEc2BastionHost',
      {
        vpc: vpcStack.vpc,
      }
    );
    ec2BastionHostStack.addDependency(vpcStack);

    // EFS
    const efsStack = new EfsStack(this, 'SeamlessEfs', { vpc: vpcStack.vpc });
    efsStack.addDependency(vpcStack);

    // RDS
    const rdsStack = new RdsStack(this, 'SeamlessRds', {
      vpc: vpcStack.vpc,
    });
    rdsStack.addDependency(vpcStack);

    // ElastiCache
    const elastiCacheStack = new ElastiCacheStack(this, 'SeamlessElastiCache', {
      vpc: vpcStack.vpc,
    });
    elastiCacheStack.addDependency(vpcStack);

    // Demo Fargate Microservices Stack
    const DEMO_IMAGE = 'jasonherngwang/seamless-demo-notification'; // Basic Express app

    const demoFargateStack = new DemoFargateStack(
      this,
      'SeamlessDemoFargateStack',
      {
        vpc: vpcStack.vpc,
        demoImage: DEMO_IMAGE,
      }
    );
    demoFargateStack.addDependency(vpcStack);

    // Seamless backend stack
    // Docker image is publicly hosted on DockerHub
    const BACKEND_IMAGE = 'ejweiner/seamless-backend';

    const ecsBackendStack = new EcsBackendStack(this, 'SeamlessBackend', {
      vpc: vpcStack.vpc,
      rdsPassword: rdsStack.rdsCredentialsSecret
        .secretValueFromJson('password')
        .unsafeUnwrap(),
      rdsHostname: rdsStack.rdsInstance.instanceEndpoint.hostname,
      rdsPort: rdsStack.rdsInstance.instanceEndpoint.port, // number
      elastiCacheEndpoint:
        elastiCacheStack.elastiCacheCluster.attrRedisEndpointAddress,
      elastiCachePort:
        elastiCacheStack.elastiCacheCluster.attrRedisEndpointPort, // string
      backendImage: BACKEND_IMAGE,
    });
    // Backend requires endpoints to create connection strings for RDS and Elasticache
    ecsBackendStack.addDependency(rdsStack);
    ecsBackendStack.addDependency(elastiCacheStack);

    // API Gateway
    const apiGatewayStack = new ApiGatewayStack(this, 'SeamlessApiGateway', {
      vpc: vpcStack.vpc,
      fargate: ecsBackendStack.fargate,
    });
    apiGatewayStack.addDependency(ecsBackendStack);

    // ECS
    const ecsTasksStack = new EcsTasksStack(this, 'SeamlessEcs', {
      vpc: vpcStack.vpc,
      efs: efsStack.efs,
      // API Gateway endpoint to send container logs to
      logSubscriberUrl: apiGatewayStack.httpApi.attrApiEndpoint,
    });
    // ECS executors need the API Gateway URL so they can send logs
    ecsTasksStack.addDependency(apiGatewayStack);

    // SNS
    const snsStack = new SnsStack(this, 'SeamlessSns');
    snsStack.addDependency(apiGatewayStack);

    // State machine
    const stateMachineStack = new StateMachineStack(
      this,
      'SeamlessStateMachine',
      {
        vpc: vpcStack.vpc,
        ecsCluster: ecsTasksStack.cluster,
        httpApi: apiGatewayStack.httpApi,
        topic: snsStack.topic,
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

    stateMachineStack.addDependency(vpcStack);
    stateMachineStack.addDependency(snsStack);
    stateMachineStack.addDependency(ecsTasksStack);
    stateMachineStack.addDependency(rdsStack);
    stateMachineStack.addDependency(ecsBackendStack);
    stateMachineStack.addDependency(apiGatewayStack);
  }
}

import { Stack, StackProps } from 'aws-cdk-lib';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { ApiGatewayStack } from './stacks/api-gateway-stack';
import { Ec2BastionHostStack } from './stacks/ec2-bastion-host-stack';
import { EcsTasksStack } from './stacks/ecs-tasks-stack';
import { EfsStack } from './stacks/efs-stack';
import { ElastiCacheStack } from './stacks/elasticache-stack';
import { FargateBackendStack } from './stacks/fargate-backend-stack';
import { FargateWithServiceConnectStack } from './stacks/fargate-service-connect-stack';
import { RdsStack } from './stacks/rds-stack';
import { SnsStack } from './stacks/sns-stack';
import { StateMachineStack } from './stacks/state-machine-stack';
import { VpcStack } from './stacks/vpc-stack';
import { ServiceOptions } from './types';

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
      },
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

    // Fargate Cluster for Microservices: Payment and Notification
    // Services can access each other at http://serviceDiscoveryName:port
    const prodServices: ServiceOptions[] = [
      {
        name: 'payment',
        serviceDiscoveryName: 'seamless-demo-payment',
        image:
          '697645747316.dkr.ecr.us-east-1.amazonaws.com/seamless-cicd/seamless-demo-payment:1',
        port: 3000,
        addToAlbTargetGroup: true,
      },
      {
        name: 'notification',
        serviceDiscoveryName: 'seamless-demo-notification',
        image:
          '697645747316.dkr.ecr.us-east-1.amazonaws.com/seamless-cicd/seamless-demo-notification:1',
        port: 3000,
        addToAlbTargetGroup: false,
        environment: {
          NOTIFICATION_ENDPOINT: 'https://eo181huqgm366vz.m.pipedream.net',
        },
      },
    ];

    // Demo - Production Cluster
    const prodStack = new FargateWithServiceConnectStack(this, 'SeamlessProd', {
      vpc: vpcStack.vpc,
      services: prodServices,
      entryPort: 3000, // The port on the public-facing service
    });
    prodStack.addDependency(vpcStack);

    // Demo - Staging Cluster
    const stagingStack = new FargateWithServiceConnectStack(
      this,
      'SeamlessStaging',
      {
        vpc: vpcStack.vpc,
        services: prodServices, // Same services as prod
        entryPort: 3000,
      },
    );
    stagingStack.addDependency(vpcStack);

    // Backend Fargate Cluster
    const fargateBackendStack = new FargateBackendStack(
      this,
      'SeamlessBackendCluster',
      {
        vpc: vpcStack.vpc,
        backendImage: 'jasonherngwang/seamless-backend:1',
        rdsPassword: rdsStack.rdsCredentialsSecret
          .secretValueFromJson('password')
          .unsafeUnwrap(),
        rdsHostname: rdsStack.rdsInstance.instanceEndpoint.hostname,
        rdsPort: rdsStack.rdsInstance.instanceEndpoint.port, // number
        elastiCacheEndpoint:
          elastiCacheStack.elastiCacheCluster.attrRedisEndpointAddress,
        elastiCachePort:
          elastiCacheStack.elastiCacheCluster.attrRedisEndpointPort, // string
      },
    );
    fargateBackendStack.addDependency(vpcStack);
    fargateBackendStack.addDependency(rdsStack);
    fargateBackendStack.addDependency(elastiCacheStack);

    // HTTP and WebSocket API Gateways
    const apiGatewayStack = new ApiGatewayStack(this, 'SeamlessApiGateway', {
      vpc: vpcStack.vpc,
      listener: fargateBackendStack.fargate.listener,
    });
    // API Gateway needs to know the Backend's ALB Fargate listener ARN
    apiGatewayStack.addDependency(fargateBackendStack);

    // ECS
    const ecsTasksStack = new EcsTasksStack(this, 'SeamlessEcs', {
      vpc: vpcStack.vpc,
      efs: efsStack.efs,
      // API Gateway URL to send container logs
      logSubscriberUrl: `${apiGatewayStack.httpApi.attrApiEndpoint}/internal/log-updates`,
    });
    // ECS executors need the API Gateway URL so they can send logs
    ecsTasksStack.addDependency(apiGatewayStack);

    // SNS
    const snsStack = new SnsStack(this, 'SeamlessSns');
    snsStack.addDependency(apiGatewayStack);

    // State machine (Step Function)
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
      },
    );

    stateMachineStack.addDependency(snsStack);
    stateMachineStack.addDependency(ecsTasksStack);
    stateMachineStack.addDependency(fargateBackendStack);
    stateMachineStack.addDependency(apiGatewayStack);
  }
}

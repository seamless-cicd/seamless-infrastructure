import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ApiGatewayStack } from './stacks/api-gateway-stack';
import { Ec2BastionHostStack } from './stacks/ec2-bastion-host-stack';
import { EcsBackendStack } from './stacks/ecs-backend-stack';
import { EcsTasksStack } from './stacks/ecs-tasks-stack';
import { EfsStack } from './stacks/efs-stack';
import { ElastiCacheStack } from './stacks/elasticache-stack';
import { DemoProdClusterStack } from './stacks/fargate-demo-prod-cluster-stack';
import { DemoProdStack } from './stacks/fargate-demo-prod-stack';
import { RdsStack } from './stacks/rds-stack';
import { SnsStack } from './stacks/sns-stack';
import { StateMachineStack } from './stacks/state-machine-stack';
import { VpcStack } from './stacks/vpc-stack';

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

    // Demo Microservices on Fargate: Payment Service and Notification Service
    // Cluster
    const demoProdClusterStack = new DemoProdClusterStack(
      this,
      'SeamlessDemoProdClusterStack',
      {
        vpc: vpcStack.vpc,
      },
    );
    demoProdClusterStack.addDependency(vpcStack);

    // Microservices - Provide your latest tagged images in ECR
    const demoProdStack = new DemoProdStack(this, 'SeamlessDemoProdStack', {
      vpc: vpcStack.vpc,
      cluster: demoProdClusterStack.cluster,
      paymentServiceImage:
        '697645747316.dkr.ecr.us-east-1.amazonaws.com/seamless-cicd/seamless-demo-prod-payment:latest',
      notificationServiceImage:
        '697645747316.dkr.ecr.us-east-1.amazonaws.com/seamless-cicd/seamless-demo-prod-notification:latest',
      notificationServiceEndpoint: 'https://eo181huqgm366vz.m.pipedream.net',
    });
    demoProdStack.addDependency(vpcStack);

    // Seamless backend stack - Publicly hosted
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
      backendImage: 'jasonherngwang/seamless-backend:1',
    });
    // Backend requires endpoints to create connection strings for RDS and Elasticache
    ecsBackendStack.addDependency(rdsStack);
    ecsBackendStack.addDependency(elastiCacheStack);

    // HTTP and WebSocket API Gateways
    const apiGatewayStack = new ApiGatewayStack(this, 'SeamlessApiGateway', {
      vpc: vpcStack.vpc,
      fargate: ecsBackendStack.fargate,
    });
    // API Gateway needs to know the Backend's ALB Fargate listener ARN
    apiGatewayStack.addDependency(ecsBackendStack);

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
      },
    );

    stateMachineStack.addDependency(vpcStack);
    stateMachineStack.addDependency(snsStack);
    stateMachineStack.addDependency(ecsTasksStack);
    stateMachineStack.addDependency(rdsStack);
    stateMachineStack.addDependency(ecsBackendStack);
    stateMachineStack.addDependency(apiGatewayStack);
  }
}

import { Duration, NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { IVpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { Cluster, ContainerImage } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

import { config } from 'dotenv';
config();

import {
  AWS_ACCOUNT_ID,
  AWS_REGION,
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
} from '../constants';

export interface FargateBackendStackProps extends NestedStackProps {
  readonly vpc: IVpc;
  readonly backendImage: string;
  readonly rdsPassword: string;
  readonly rdsHostname: string;
  readonly rdsPort: number;
  readonly elastiCacheEndpoint: string;
  readonly elastiCachePort: string;
}

export class FargateBackendStack extends NestedStack {
  readonly cluster: Cluster;
  readonly fargate: ApplicationLoadBalancedFargateService;

  constructor(scope: Construct, id: string, props: FargateBackendStackProps) {
    super(scope, id, props);

    // Prop validation
    if (!props?.vpc) {
      throw new Error('No VPC provided');
    }

    if (!props?.backendImage) {
      throw new Error('No Docker image provided');
    }

    if (!props?.rdsPassword) {
      throw new Error('No RDS password provided');
    }

    if (!props?.rdsHostname) {
      throw new Error('No RDS hostname provided');
    }

    if (!props?.elastiCacheEndpoint) {
      throw new Error('No ElastiCache endpoint provided');
    }

    // Fargate Cluster
    this.cluster = new Cluster(this, 'SeamlessBackendCluster', {
      clusterName: 'SeamlessBackendCluster',
      vpc: props.vpc,
      containerInsights: true,
    });

    // Fargate Service
    this.fargate = new ApplicationLoadBalancedFargateService(
      this,
      'SeamlessBackendService',
      {
        serviceName: 'SeamlessBackendService',
        cluster: this.cluster,
        cpu: 256,
        memoryLimitMiB: 1024,
        desiredCount: 1,
        publicLoadBalancer: false,
        assignPublicIp: false,
        circuitBreaker: {
          rollback: true,
        },
        taskSubnets: {
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
        },
        taskImageOptions: {
          image: ContainerImage.fromRegistry(props.backendImage),
          containerPort: 3000,
          enableLogging: true,
          environment: {
            AWS_ACCOUNT_ID,
            AWS_REGION,
            GITHUB_CLIENT_ID,
            GITHUB_CLIENT_SECRET,
            BACKEND_PORT: '3000',
            DATABASE_URL: `postgresql://postgres:${props.rdsPassword}@${
              props.rdsHostname
            }:${props.rdsPort || 5432}/seamless_rds?schema=public`,
            REDIS_HOST: props.elastiCacheEndpoint,
            REDIS_PORT: props.elastiCachePort || '6379',
          },
        },
      },
    );

    // Auto-scaling based on number of requests
    // const scalableTarget = this.fargate.service.autoScaleTaskCount({
    //   minCapacity: 1,
    //   maxCapacity: 5,
    // });

    // scalableTarget.scaleOnRequestCount('RequestScaling', {
    //   targetGroup: this.fargate.targetGroup,
    //   requestsPerTarget: 1000,
    //   scaleInCooldown: Duration.seconds(60),
    //   scaleOutCooldown: Duration.seconds(60),
    // });

    // Add IAM policy to grant permissions to the Backend Fargate service
    const policy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'execute-api:*', // To post connections to Websockets
        'apigateway:*', // To call HTTP and WebSocket API Gateways
        'states:*', // To start Step Functions
        'ecs:*', // To lookup Task Definitions and update ECS Services
        'ecr:*', // To lookup ECR repositories
        'iam:PassRole', // To allow the Fargate Service to pass its Role to ECS
      ],
      resources: ['*'],
    });

    this.fargate.taskDefinition.addToTaskRolePolicy(policy);
  }
}

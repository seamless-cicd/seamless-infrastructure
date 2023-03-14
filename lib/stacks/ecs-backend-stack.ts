import { NestedStack, NestedStackProps, Fn } from 'aws-cdk-lib';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { Cluster, ContainerImage } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { ElastiCacheStack } from './elasticache-stack';
import { RdsStack } from './rds-stack';
import { Construct } from 'constructs';

import { config } from 'dotenv';
config();

import {
  AWS_ACCOUNT_ID,
  AWS_ACCESS_KEY,
  AWS_SECRET_ACCESS_KEY,
  GITHUB_PAT,
  GITHUB_REPO_URL,
} from '../constants';

export interface EcsBackendStackProps extends NestedStackProps {
  readonly vpc: IVpc;
  readonly rdsStack: RdsStack;
  readonly elastiCacheStack: ElastiCacheStack;
}

export class EcsBackendStack extends NestedStack {
  readonly cluster: Cluster;
  readonly fargate: ApplicationLoadBalancedFargateService;

  constructor(scope: Construct, id: string, props: EcsBackendStackProps) {
    super(scope, id, props);

    // Prop validation
    if (!props?.vpc) {
      throw new Error('No VPC provided');
    }

    this.cluster = new Cluster(this, 'BackendServiceCluster', {
      vpc: props.vpc,
      clusterName: 'backend-service-cluster',
      containerInsights: true,
    });

    const backendServiceImage = ContainerImage.fromRegistry(
      'ejweiner/seamless-backend'
    );

    this.fargate = new ApplicationLoadBalancedFargateService(
      this,
      'BackendServiceALBFargateService',
      {
        cluster: this.cluster,
        cpu: 256,
        memoryLimitMiB: 1024,
        desiredCount: 1,
        publicLoadBalancer: true,
        // TODO: Disable public IP, but allow outbound traffic for pulling image
        // https://aws.amazon.com/premiumsupport/knowledge-center/ecs-fargate-pull-container-error/
        assignPublicIp: true,
        circuitBreaker: {
          rollback: true,
        },
        taskImageOptions: {
          image: backendServiceImage,
          containerPort: 3000,
          environment: {
            BACKEND_PORT: '3000',
            DATABASE_URL: `postgresql://postgres:${props.rdsStack.rdsCredentialsSecret
              .secretValueFromJson('password')
              .unsafeUnwrap()}@${
              props.rdsStack.rdsInstance.instanceEndpoint.hostname
            }:${
              props.rdsStack.rdsInstance.instanceEndpoint.port
            }/seamlessRds?schema=public`,
            REDIS_HOST:
              props.elastiCacheStack.elastiCacheCluster
                .attrRedisEndpointAddress,
            REDIS_PORT: '6379',
            // AWS_STEP_FUNCTION_ARN: props.stateMachineArn,
            // Supplied in env
            AWS_ACCOUNT_ID,
            AWS_ACCESS_KEY,
            AWS_SECRET_ACCESS_KEY,
            GITHUB_PAT,
            GITHUB_REPO_URL,
          },
        },
      }
    );
  }
}

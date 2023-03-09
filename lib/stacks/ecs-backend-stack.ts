import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { SubnetType } from 'aws-cdk-lib/aws-ec2';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { Cluster, ContainerImage } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { DatabaseInstance } from 'aws-cdk-lib/aws-rds';

import { Construct } from 'constructs';

import { config } from 'dotenv';
config();

export interface EcsBackendStackProps extends NestedStackProps {
  readonly vpc: IVpc;
  readonly rdsInstance: DatabaseInstance;
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

    if (!process.env.ECR_REPO) {
      throw new Error('No ECR repo provided');
    }

    if (!process.env.CONTAINER_PORT) {
      throw new Error('No container port provided');
    }

    if (!process.env.DATABASE_URL) {
      throw new Error(
        'No database URL provided (needed for ECS backend service)'
      );
    }

    this.cluster = new Cluster(this, 'BackendServiceCluster', {
      vpc: props.vpc,
      clusterName: 'backend-service-cluster',
      containerInsights: true,
    });

    const backendServiceImage = ContainerImage.fromRegistry(
      process.env.ECR_REPO
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
          containerPort: parseInt(process.env.CONTAINER_PORT),
          // Specify environment variables for backend
          environment: {
            PORT: '3000',
            // TODO: Dynamically compute DATABASE_URL
            DATABASE_URL: process.env.DATABASE_URL,
          },
        },
      }
    );
  }
}

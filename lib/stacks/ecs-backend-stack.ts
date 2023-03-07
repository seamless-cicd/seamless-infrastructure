import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { SubnetType } from 'aws-cdk-lib/aws-ec2';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { Cluster, ContainerImage } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { DatabaseInstance } from 'aws-cdk-lib/aws-rds';

import { Construct } from 'constructs';

import { config } from 'dotenv';
config();

export interface EcsStackProps extends NestedStackProps {
  readonly vpc: IVpc;
  readonly rdsInstance: DatabaseInstance;
}

export class EcsBackendStack extends NestedStack {
  readonly cluster: Cluster;

  constructor(scope: Construct, id: string, props: EcsStackProps) {
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

    new ApplicationLoadBalancedFargateService(
      this,
      'BackendServiceALBFargateService',
      {
        cluster: this.cluster,
        cpu: 256,
        memoryLimitMiB: 1024,
        desiredCount: 1,
        publicLoadBalancer: true,
        assignPublicIp: true,
        loadBalancerName: 'BackendServiceALB',
        taskSubnets: props.vpc.selectSubnets({
          subnetType: SubnetType.PUBLIC,
        }),
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

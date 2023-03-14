import { NestedStack, NestedStackProps, Fn } from 'aws-cdk-lib';
import { IVpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { Cluster, ContainerImage } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { Construct } from 'constructs';

import { config } from 'dotenv';
config();

export interface DemoFargateStackProps extends NestedStackProps {
  readonly vpc: IVpc;
  readonly demoImage: string;
}

export class DemoFargateStack extends NestedStack {
  readonly cluster: Cluster;
  readonly fargate: ApplicationLoadBalancedFargateService;

  constructor(scope: Construct, id: string, props: DemoFargateStackProps) {
    super(scope, id, props);

    // Prop validation
    if (!props?.vpc) {
      throw new Error('No VPC provided');
    }

    if (!props?.demoImage) {
      throw new Error('No Docker image provided');
    }

    // Fargate cluster for Seamless backend server
    this.cluster = new Cluster(this, 'SeamlessDemoCluster', {
      vpc: props.vpc,
      containerInsights: true,
    });

    const demoServiceImage = ContainerImage.fromRegistry(props.demoImage);

    // this.fargate = new ApplicationLoadBalancedFargateService(
    //   this,
    //   'BackendALBFargateService',
    //   {
    //     cluster: this.cluster,
    //     cpu: 256,
    //     memoryLimitMiB: 1024,
    //     desiredCount: 1,
    //     publicLoadBalancer: false,
    //     assignPublicIp: false,
    //     circuitBreaker: {
    //       rollback: true,
    //     },
    //     taskSubnets: {
    //       subnetType: SubnetType.PRIVATE_WITH_EGRESS,
    //     },
    //     taskImageOptions: {
    //       image: backendServiceImage,
    //       containerPort: 3000,
    //       environment: {
    //         BACKEND_PORT: '3000',
    //         // Database name "seamless_rds" is defined in RDS Stack
    //         DATABASE_URL: `postgresql://postgres:${props.rdsPassword}@${
    //           props.rdsHostname
    //         }:${props.rdsPort || 5432}/seamless_rds?schema=public`,
    //         REDIS_HOST: props.elastiCacheEndpoint,
    //         REDIS_PORT: props.elastiCachePort || '6379',
    //         // These environment variables are forwarded to the server
    //         AWS_ACCOUNT_ID,
    //         AWS_ACCESS_KEY,
    //         AWS_SECRET_ACCESS_KEY,
    //         GITHUB_CLIENT_ID,
    //         GITHUB_CLIENT_SECRET,
    //         GITHUB_PAT,
    //       },
    //     },
    //   }
    // );
  }
}

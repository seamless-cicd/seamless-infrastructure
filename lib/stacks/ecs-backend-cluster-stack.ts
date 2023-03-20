import { CfnOutput, NestedStack, NestedStackProps, Tags } from 'aws-cdk-lib';
import {
  IVpc,
  Peer,
  Port,
  SecurityGroup,
  SubnetType,
} from 'aws-cdk-lib/aws-ec2';
import {
  Cluster,
  ContainerImage,
  FargateService,
  FargateTaskDefinition,
} from 'aws-cdk-lib/aws-ecs';
import {
  ApplicationListener,
  ApplicationLoadBalancer,
  ApplicationProtocol,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
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

export interface EcsBackendClusterStackProps extends NestedStackProps {
  readonly vpc: IVpc;
  readonly backendImage: string;
  readonly rdsPassword: string;
  readonly rdsHostname: string;
  readonly rdsPort: number;
  readonly elastiCacheEndpoint: string;
  readonly elastiCachePort: string;
}

export class EcsBackendClusterStack extends NestedStack {
  readonly cluster: Cluster;
  readonly fargate: FargateService;
  readonly fargateSecurityGroup: SecurityGroup;
  readonly albSecurityGroup: SecurityGroup;
  readonly loadBalancer: ApplicationLoadBalancer;
  readonly listener: ApplicationListener;

  constructor(
    scope: Construct,
    id: string,
    props: EcsBackendClusterStackProps,
  ) {
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

    // Security groups for Fargate Services and ALB
    this.fargateSecurityGroup = new SecurityGroup(
      this,
      `SeamlessBackendFargateSecurityGroup`,
      {
        vpc: props.vpc,
        allowAllOutbound: true,
      },
    );
    Tags.of(this.fargateSecurityGroup).add(
      'Name',
      `SeamlessBackendFargateSecurityGroup`,
    );

    this.albSecurityGroup = new SecurityGroup(
      this,
      `SeamlessBackendALBSecurityGroup`,
      {
        vpc: props.vpc,
        allowAllOutbound: true,
      },
    );
    Tags.of(this.albSecurityGroup).add(
      'Name',
      `SeamlessBackendALBSecurityGroup`,
    );

    // Backend operates on port 3000
    this.fargateSecurityGroup.addIngressRule(
      Peer.anyIpv4(),
      Port.tcp(3000),
      `Allow ALB traffic to port 3000`,
    );

    // Fargate Cluster for Seamless backend server
    this.cluster = new Cluster(this, 'SeamlessBackendCluster', {
      clusterName: 'SeamlessBackendCluster',
      vpc: props.vpc,
      containerInsights: true,
    });

    // Create Task Definition
    const taskDefinition = new FargateTaskDefinition(
      this,
      `SeamlessBackendTaskDefinition`,
      {
        cpu: 256,
        memoryLimitMiB: 1024,
      },
    );

    taskDefinition.addContainer('SeamlessBackend', {
      containerName: 'SeamlessBackendContainer',
      image: ContainerImage.fromRegistry(props.backendImage),
      portMappings: [
        {
          containerPort: 3000,
        },
      ],
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
    });

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
    taskDefinition.addToTaskRolePolicy(policy);

    // Fargate Service
    this.fargate = new FargateService(this, 'BackendALBFargateService', {
      serviceName: 'SeamlessBackendService',
      cluster: this.cluster,
      desiredCount: 1,
      assignPublicIp: true,
      circuitBreaker: {
        rollback: true,
      },
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      },
      taskDefinition,
      securityGroups: [this.fargateSecurityGroup],
    });

    // Public load balancer
    const loadBalancerName = `SeamlessBackendALB`;
    this.loadBalancer = new ApplicationLoadBalancer(this, loadBalancerName, {
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: this.albSecurityGroup,
    });
    Tags.of(this.loadBalancer).add('Name', loadBalancerName);

    // ALB listens for requests on port 80
    this.listener = this.loadBalancer.addListener(
      `SeamlessBackendALBHttpListener`,
      {
        port: 80,
        protocol: ApplicationProtocol.HTTP,
        open: true,
      },
    );

    this.listener.addTargets('SeamlessBackendService', {
      port: 3000,
      protocol: ApplicationProtocol.HTTP,
      targets: [this.fargate],
    });

    // Supply the DNS name of this load balancer
    new CfnOutput(this, `SeamlessBackendALBDNSName`, {
      value: this.loadBalancer.loadBalancerDnsName,
      description: 'Application Load Balancer DNS Name',
      exportName: `SeamlessBackendALBDNSName`,
    });
  }
}

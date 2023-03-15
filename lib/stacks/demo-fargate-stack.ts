import { NestedStack, NestedStackProps, Fn } from 'aws-cdk-lib';
import { IVpc, SubnetType, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import {
  Cluster,
  ContainerImage,
  FargateTaskDefinition,
} from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { Construct } from 'constructs';

import { config } from 'dotenv';
config();

import { DEMO_NOTIFICATION_ENDPOINT } from '../constants';

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
      clusterName: 'seamless-demo-cluster',
      vpc: props.vpc,
      containerInsights: true,
    });

    const demoServiceImage = ContainerImage.fromRegistry(props.demoImage);

    const SeamlessDemoNotificationTaskDefinition = new FargateTaskDefinition(
      this,
      'SeamlessDemoNotificationTaskDefinition'
    );

    SeamlessDemoNotificationTaskDefinition.addContainer(
      'SeamlessDemoNotificationContainer',
      {
        image: demoServiceImage,
        cpu: 256,
        memoryLimitMiB: 512,
        portMappings: [
          {
            containerPort: 3000,
            hostPort: 3000,
          },
        ],
        environment: {
          NOTIFICATION_ENDPOINT: DEMO_NOTIFICATION_ENDPOINT || '',
        },
      }
    );

    this.fargate = new ApplicationLoadBalancedFargateService(
      this,
      'DemoALBFargateService',
      {
        serviceName: 'seamless-demo-notification',
        cluster: this.cluster,
        desiredCount: 1,
        publicLoadBalancer: true,
        assignPublicIp: true,
        circuitBreaker: {
          rollback: true,
        },
        taskSubnets: {
          subnetType: SubnetType.PUBLIC,
        },
        taskDefinition: SeamlessDemoNotificationTaskDefinition,
        listenerPort: 80,
      }
    );
  }
}

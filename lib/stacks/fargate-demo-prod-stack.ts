import { Aspects, NestedStack, NestedStackProps, Tag } from 'aws-cdk-lib';
import { IVpc, Peer, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import {
  AppProtocol,
  AwsLogDriver,
  Cluster,
  ContainerImage,
  FargateService,
  FargateTaskDefinition,
  Protocol,
} from 'aws-cdk-lib/aws-ecs';
import {
  ApplicationLoadBalancer,
  ApplicationProtocol,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

import { config } from 'dotenv';
config();

export interface DemoProdStackProps extends NestedStackProps {
  readonly vpc: IVpc;
  readonly cluster: Cluster;
  readonly paymentServiceImage: string;
  readonly notificationServiceImage: string;
}

export class DemoProdStack extends NestedStack {
  readonly securityGroup: SecurityGroup;
  readonly paymentService: FargateService;
  readonly notificationService: FargateService;
  readonly loadBalancer: ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: DemoProdStackProps) {
    super(scope, id, props);

    // Prop validation
    if (!props?.vpc) {
      throw new Error('No VPC provided');
    }

    if (!props?.cluster) {
      throw new Error('No Cluster provided');
    }

    if (!props?.paymentServiceImage) {
      throw new Error('No Payment image provided');
    }

    if (!props?.notificationServiceImage) {
      throw new Error('No Notification image provided');
    }

    // Security group
    this.securityGroup = new SecurityGroup(
      this,
      'SeamlessDemoProdSecurityGroup',
      {
        vpc: props.vpc,
        allowAllOutbound: true,
      },
    );

    this.securityGroup.addIngressRule(
      Peer.anyIpv4(),
      Port.tcp(3000),
      'Allow traffic to port 3000',
    );

    Aspects.of(this.securityGroup).add(
      new Tag('Name', 'SeamlessDemoProdSecurityGroup'),
    );

    // Payment Service
    const paymentTaskDefinition = new FargateTaskDefinition(
      this,
      'SeamlessDemoProdPaymentTaskDefinition',
    );

    paymentTaskDefinition.addContainer('SeamlessDemoProdPaymentContainer', {
      containerName: 'SeamlessDemoProdPaymentContainer',
      image: ContainerImage.fromRegistry(props.paymentServiceImage),
      cpu: 256,
      memoryLimitMiB: 512,
      portMappings: [
        {
          containerPort: 3000,
          name: 'seamless-demo-prod-payment-3000-tcp',
          appProtocol: AppProtocol.http,
          protocol: Protocol.TCP,
        },
      ],
      logging: new AwsLogDriver({
        streamPrefix: 'seamless-demo-prod-payment',
        logRetention: 1,
      }),
    });

    this.paymentService = new FargateService(
      this,
      'SeamlessDemoProdPaymentService',
      {
        assignPublicIp: true,
        cluster: props.cluster,
        serviceConnectConfiguration: {
          namespace: 'seamless-demo-prod',
          services: [
            {
              port: 3000,
              portMappingName: 'seamless-demo-prod-payment-3000-tcp',
              discoveryName: 'seamless-demo-prod-payment',
              dnsName: 'seamless-demo-prod-payment',
            },
          ],
        },
        taskDefinition: paymentTaskDefinition,
        securityGroups: [this.securityGroup],
      },
    );

    // Create private Notification Service (client-server Service Connect service)
    const notificationTaskDefinition = new FargateTaskDefinition(
      this,
      'SeamlessDemoProdNotificationTaskDefinition',
    );

    notificationTaskDefinition.addContainer(
      'SeamlessDemoProdNotificationContainer',
      {
        containerName: 'SeamlessDemoProdNotificationContainer',
        image: ContainerImage.fromRegistry(props.notificationServiceImage),
        cpu: 256,
        memoryLimitMiB: 512,
        portMappings: [
          {
            containerPort: 3000,
            name: 'seamless-demo-prod-notification-3000-tcp',
            appProtocol: AppProtocol.http,
            protocol: Protocol.TCP,
          },
        ],
        logging: new AwsLogDriver({
          streamPrefix: 'seamless-demo-prod-notification',
          logRetention: 1,
        }),
        environment: {
          NOTIFICATION_ENDPOINT: process.env.DEMO_NOTIFICATION_ENDPOINT || '',
        },
      },
    );

    this.notificationService = new FargateService(
      this,
      'SeamlessDemoProdNotificationService',
      {
        assignPublicIp: true,
        cluster: props.cluster,
        serviceConnectConfiguration: {
          namespace: 'seamless-demo-prod',
          services: [
            {
              port: 3000,
              portMappingName: 'seamless-demo-prod-notification-3000-tcp',
              discoveryName: 'seamless-demo-prod-notification',
              dnsName: 'seamless-demo-prod-notification',
            },
          ],
        },
        taskDefinition: notificationTaskDefinition,
        securityGroups: [this.securityGroup],
      },
    );

    // Load balancer
    this.loadBalancer = new ApplicationLoadBalancer(
      this,
      'SeamlessDemoProdALB',
      {
        vpc: props.vpc,
        internetFacing: true,
      },
    );

    const listener = this.loadBalancer.addListener('Port80Listener', {
      port: 80,
      protocol: ApplicationProtocol.HTTP,
      open: true,
    });

    listener.addTargets('SeamlessDemoProdPaymentService', {
      port: 3000,
      protocol: ApplicationProtocol.HTTP,
      targets: [this.paymentService],
    });
  }
}

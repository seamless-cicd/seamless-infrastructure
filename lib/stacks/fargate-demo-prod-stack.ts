import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { IVpc, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import {
  Cluster,
  ContainerImage,
  FargateService,
  FargateTaskDefinition,
} from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { PrivateDnsNamespace } from 'aws-cdk-lib/aws-servicediscovery';
import { Construct } from 'constructs';

import { config } from 'dotenv';
config();

export interface DemoProdStackProps extends NestedStackProps {
  readonly vpc: IVpc;
  readonly paymentServiceImage: string;
  readonly notificationServiceImage: string;
}

export class DemoProdStack extends NestedStack {
  readonly securityGroup: SecurityGroup;
  readonly privateDnsNamespace: PrivateDnsNamespace;
  readonly cluster: Cluster;
  readonly loadBalancer: ApplicationLoadBalancer;
  readonly paymentService: FargateService;
  readonly notificationService: FargateService;

  constructor(scope: Construct, id: string, props: DemoProdStackProps) {
    super(scope, id, props);

    // Prop validation
    if (!props?.vpc) {
      throw new Error('No VPC provided');
    }

    if (!props?.paymentServiceImage) {
      throw new Error('No Payment image provided');
    }

    if (!props?.notificationServiceImage) {
      throw new Error('No Notification image provided');
    }

    // Create Fargate cluster with Service Connect namespace
    this.cluster = new Cluster(this, 'SeamlessDemoProdCluster', {
      vpc: props.vpc,
      containerInsights: true,
      defaultCloudMapNamespace: {
        name: 'local',
      },
    });

    // Private namespace for service discovery
    this.privateDnsNamespace = this.cluster
      .defaultCloudMapNamespace as PrivateDnsNamespace;

    // Create public-facing Payment Service (client-only Service Connect service)
    const paymentTaskDefinition = new FargateTaskDefinition(
      this,
      'SeamlessDemoProdPaymentTaskDefinition'
    );

    paymentTaskDefinition.addContainer('PaymentContainer', {
      containerName: 'PaymentContainer',
      image: ContainerImage.fromRegistry(props.paymentServiceImage),
      cpu: 256,
      memoryLimitMiB: 512,
      portMappings: [
        {
          containerPort: 3000,
          // protocol: Protocol.TCP,
          // appProtocol: AppProtocol.http,
        },
      ],
    });

    this.paymentService = new FargateService(
      this,
      'SeamlessDemoProdPaymentService',
      {
        assignPublicIp: true,
        cluster: this.cluster,
        serviceConnectConfiguration: {
          namespace: this.privateDnsNamespace.namespaceName,
        },
        taskDefinition: paymentTaskDefinition,
      }
    );

    // Create private Notification Service (client-server Service Connect service)
    const notificationTaskDefinition = new FargateTaskDefinition(
      this,
      'SeamlessDemoProdNotificationTaskDefinition'
    );

    const notificationContainerPortMappingName =
      'seamless-demo-prod-notification';

    notificationTaskDefinition.addContainer('NotificationContainer', {
      containerName: 'NotificationContainer',
      image: ContainerImage.fromRegistry(props.notificationServiceImage),
      cpu: 256,
      memoryLimitMiB: 512,
      portMappings: [
        {
          containerPort: 3000,
          name: notificationContainerPortMappingName,
        },
      ],
      environment: {
        NOTIFICATION_ENDPOINT: process.env.DEMO_NOTIFICATION_ENDPOINT || '',
      },
    });

    this.notificationService = new FargateService(
      this,
      'SeamlessDemoProdNotificationService',
      {
        assignPublicIp: true,
        cluster: this.cluster,
        serviceConnectConfiguration: {
          namespace: this.privateDnsNamespace.namespaceName,
          services: [{ portMappingName: notificationContainerPortMappingName }],
        },
        taskDefinition: notificationTaskDefinition,
      }
    );
  }
}

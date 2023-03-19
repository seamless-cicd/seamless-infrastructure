import { CfnOutput, NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { IVpc, Peer, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import {
  AppProtocol,
  AwsLogDriver,
  Cluster,
  EcrImage,
  FargateService,
  FargateTaskDefinition,
  Protocol,
} from 'aws-cdk-lib/aws-ecs';
import {
  ApplicationLoadBalancer,
  ApplicationProtocol,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { PrivateDnsNamespace } from 'aws-cdk-lib/aws-servicediscovery';
import { Construct } from 'constructs';
import { ServiceOptions } from '../types';
import { capitalize, pascalToKebab } from '../utils/utils';

import { config } from 'dotenv';
config();

export interface FargateWithServiceConnectStackProps extends NestedStackProps {
  readonly vpc: IVpc;
  readonly services: ServiceOptions[];
  readonly entryPort: number;
}

export class FargateWithServiceConnectStack extends NestedStack {
  readonly cluster: Cluster;
  readonly namespace: PrivateDnsNamespace;
  readonly fargateSecurityGroup: SecurityGroup;
  readonly albSecurityGroup: SecurityGroup;
  readonly loadBalancer: ApplicationLoadBalancer;
  readonly loadBalancerTargets: FargateService[];

  constructor(
    scope: Construct,
    id: string,
    props: FargateWithServiceConnectStackProps,
  ) {
    super(scope, id, props);

    // Prop validation
    if (!props?.vpc) {
      throw new Error('No VPC provided');
    }

    if (!props?.services) {
      throw new Error('No services provided');
    }

    // Convert PascalCase to kebab-case, e.g. SeamlessProd -> seamless-prod
    const idKebab = pascalToKebab(id);

    // Track Fargate Services to be targeted by the ALB
    this.loadBalancerTargets = [];

    // Security groups for Fargate Services and ALB
    this.fargateSecurityGroup = new SecurityGroup(
      this,
      `${id}FargateSecurityGroup`,
      {
        securityGroupName: `${id}FargateSecurityGroup`,
        vpc: props.vpc,
        allowAllOutbound: true,
      },
    );

    this.albSecurityGroup = new SecurityGroup(this, `${id}ALBSecurityGroup`, {
      securityGroupName: `${id}ALBSecurityGroup`,
      vpc: props.vpc,
      allowAllOutbound: true,
    });

    // Allow access to the public-facing service
    this.fargateSecurityGroup.addIngressRule(
      Peer.anyIpv4(),
      Port.tcp(props.entryPort),
      `Allow ALB traffic to port ${props.entryPort}`,
    );

    // Create Fargate cluster with Cloud Map namespace
    const clusterName = `${id}Cluster`;
    this.cluster = new Cluster(this, clusterName, {
      clusterName,
      vpc: props.vpc,
      containerInsights: true,
      defaultCloudMapNamespace: {
        name: idKebab,
      },
    });

    this.namespace = this.cluster
      .defaultCloudMapNamespace as PrivateDnsNamespace;

    // Fargate Services
    props.services.forEach((service) => {
      // Attach service name to id, e.g. SeamlessProd -> SeamlessProdPayment
      const idPrefix = `${id}${capitalize(service.name)}`;
      // Convert to kebab-case, e.g. seamless-prod -> seamless-prod-payment
      const idPrefixKebab = `${idKebab}-${service.name}`;

      // Create new Task Definition with ability to access ECR images
      const taskDefinition = new FargateTaskDefinition(
        this,
        `${idPrefix}TaskDefinition`,
      );

      taskDefinition.addToExecutionRolePolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['ecr:*'],
          resources: ['*'],
        }),
      );

      // Add container
      const containerName = `${idPrefix}Container`;
      // The port mapping name links the Service Connect sidecar container with the app container
      const portMappingName = `${idPrefixKebab}-${service.port}-tcp`;

      taskDefinition.addContainer(containerName, {
        containerName,
        image: EcrImage.fromRegistry(service.image),
        cpu: 256,
        memoryLimitMiB: 512,
        portMappings: [
          {
            containerPort: service.port,
            name: portMappingName,
            appProtocol: AppProtocol.http,
            protocol: Protocol.TCP,
          },
        ],
        logging: new AwsLogDriver({
          streamPrefix: `${idPrefixKebab}-`,
          logRetention: 1,
        }),
        environment: service.environment || {}, // Optional environment vars
      });

      const serviceName = `${idPrefix}Service`;
      const fargateService = new FargateService(this, serviceName, {
        serviceName,
        cluster: this.cluster,
        serviceConnectConfiguration: {
          namespace: this.namespace.namespaceName,
          services: [
            {
              port: service.port,
              portMappingName,
              // Services accessible at: http://serviceDiscoveryName:port
              dnsName: service.serviceDiscoveryName,
            },
          ],
        },
        taskDefinition,
        securityGroups: [this.fargateSecurityGroup],
      });

      if (service.addToAlbTargetGroup) {
        this.loadBalancerTargets.push(fargateService);
      }

      // Namespaces take time to provision; must wait to deploy services
      fargateService.node.addDependency(this.namespace);
    });

    // Public load balancer
    const loadBalancerName = `${id}ALB`;
    this.loadBalancer = new ApplicationLoadBalancer(this, loadBalancerName, {
      loadBalancerName,
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: this.albSecurityGroup,
    });

    // ALB listens for requests on port 80
    const httpListener = this.loadBalancer.addListener(`${id}ALBHttpListener`, {
      port: 80,
      protocol: ApplicationProtocol.HTTP,
      open: true,
    });

    // ALB forwards requests to all Fargate Services in the target group, on entryPort
    // We do not have any listener rules configured.
    httpListener.addTargets(`${id}PaymentService`, {
      port: props.entryPort,
      protocol: ApplicationProtocol.HTTP,
      targets: this.loadBalancerTargets,
    });

    // Supply the DNS name of this load balancer
    new CfnOutput(this, `${id}ALBDNSName`, {
      value: this.loadBalancer.loadBalancerDnsName,
      description: 'Application Load Balancer DNS Name',
      exportName: `${id}ALBDNSName`,
    });
  }
}

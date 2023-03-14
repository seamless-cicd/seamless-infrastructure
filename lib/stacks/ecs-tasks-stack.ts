import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import {
  IVpc,
  InstanceType,
  InstanceClass,
  InstanceSize,
  UserData,
  SubnetType,
} from 'aws-cdk-lib/aws-ec2';
import {
  Cluster,
  EcsOptimizedImage,
  AsgCapacityProvider,
  Ec2TaskDefinition,
} from 'aws-cdk-lib/aws-ecs';
import { FileSystem } from 'aws-cdk-lib/aws-efs';
import {
  Role,
  ServicePrincipal,
  PolicyDocument,
  PolicyStatement,
  Effect,
} from 'aws-cdk-lib/aws-iam';
import { AutoScalingGroup } from 'aws-cdk-lib/aws-autoscaling';
import { Construct } from 'constructs';

import taskDefinitions from './ecs-task-definitions';

export interface EcsTasksStackProps extends NestedStackProps {
  readonly vpc: IVpc;
  readonly efs: FileSystem;
  readonly logSubscriberUrl: string;
}

export class EcsTasksStack extends NestedStack {
  readonly cluster: Cluster;
  readonly prepareTaskDefinition: Ec2TaskDefinition;
  readonly codeQualityTaskDefinition: Ec2TaskDefinition;
  readonly unitTestTaskDefinition: Ec2TaskDefinition;
  readonly buildTaskDefinition: Ec2TaskDefinition;
  readonly integrationTestTaskDefinition: Ec2TaskDefinition;
  readonly deployStagingTaskDefinition: Ec2TaskDefinition;
  readonly deployProdTaskDefinition: Ec2TaskDefinition;

  constructor(scope: Construct, id: string, props?: EcsTasksStackProps) {
    super(scope, id, props);

    // Prop validation
    if (!props?.vpc) {
      throw new Error('No VPC provided');
    }

    if (!props?.efs) {
      throw new Error('No EFS provided');
    }

    // Autoscaling group for ECS instances
    const autoScalingGroup = new AutoScalingGroup(
      this,
      'SeamlessAutoScalingGroup',
      {
        vpc: props.vpc,
        allowAllOutbound: true,
        associatePublicIpAddress: false,
        vpcSubnets: {
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
        },
        machineImage: EcsOptimizedImage.amazonLinux2(),
        instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.MICRO),
        userData: UserData.forLinux(),
        // Grant EC2 instances access to ECS cluster
        role: new Role(this, 'Ec2AccessRole', {
          assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
        }),
        minCapacity: 1,
        desiredCapacity: 1,
        maxCapacity: 10,
      }
    );

    // ECS cluster for executing tasks
    this.cluster = new Cluster(this, 'SeamlessExecutorCluster', {
      vpc: props.vpc,
      clusterName: 'SeamlessExecutorCluster',
      containerInsights: true,
    });

    // Register auto-scaling group as capacity provider for cluster
    const capacityProvider = new AsgCapacityProvider(
      this,
      'SeamlessAsgCapacityProvider',
      { autoScalingGroup }
    );

    this.cluster.addAsgCapacityProvider(capacityProvider);

    // Allow executor containers access to the resources they need
    const taskDefinitionPolicyDocument = new PolicyDocument({
      statements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [
            'ec2:*',
            'ecs:*',
            'ecr:*',
            'efs:*',
            'elasticloadbalancing:*',
          ],
          resources: ['*'],
        }),
      ],
    });

    const taskRole = new Role(this, 'EcsTaskRole', {
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
      inlinePolicies: {
        SeamlessEcsTaskPolicies: taskDefinitionPolicyDocument,
      },
    });

    // Some executors need access to a shared Docker volume on EFS
    const efsDnsName = `${props.efs.fileSystemId}.efs.${this.region}.amazonaws.com`;

    // Generator for task definitions
    const createTaskDefinition = (
      stageName: string, // kebab-cased name
      taskDefinitionId: string, // PascalCased name
      useEfs = true
    ) => {
      return taskDefinitions.create(
        this,
        stageName,
        taskDefinitionId,
        useEfs ? efsDnsName : '',
        props.logSubscriberUrl,
        taskRole
      ).taskDefinition;
    };

    // Executor task definitions
    this.prepareTaskDefinition = createTaskDefinition('prepare', 'Prepare');

    this.codeQualityTaskDefinition = createTaskDefinition(
      'code-quality',
      'CodeQuality'
    );

    this.unitTestTaskDefinition = createTaskDefinition('unit-test', 'UnitTest');

    // Build executor requires customization
    this.buildTaskDefinition = taskDefinitions.createBuildTaskDefinition(
      this,
      efsDnsName,
      props.logSubscriberUrl,
      taskRole
    );

    this.deployStagingTaskDefinition = createTaskDefinition(
      'deploy-staging',
      'DeployStaging',
      false
    );

    this.deployProdTaskDefinition = createTaskDefinition(
      'deploy-prod',
      'DeployProd',
      false
    );
  }
}

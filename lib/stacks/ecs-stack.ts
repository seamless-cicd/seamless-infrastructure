import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import {
  IVpc,
  InstanceType,
  InstanceClass,
  InstanceSize,
  UserData,
} from 'aws-cdk-lib/aws-ec2';
import {
  Cluster,
  EcsOptimizedImage,
  AsgCapacityProvider,
  Ec2TaskDefinition,
} from 'aws-cdk-lib/aws-ecs';
import { FileSystem } from 'aws-cdk-lib/aws-efs';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { AutoScalingGroup } from 'aws-cdk-lib/aws-autoscaling';
import { Construct } from 'constructs';

import taskDefinitions from './ecs-task-definitions';

export interface EcsStackProps extends NestedStackProps {
  readonly vpc: IVpc;
  readonly efs: FileSystem;
}

export class EcsStack extends NestedStack {
  readonly cluster: Cluster;
  readonly sampleSuccessTaskDefinition: Ec2TaskDefinition;
  readonly sampleFailureTaskDefinition: Ec2TaskDefinition;
  readonly prepareTaskDefinition: Ec2TaskDefinition;
  readonly codeQualityTaskDefinition: Ec2TaskDefinition;
  readonly unitTestTaskDefinition: Ec2TaskDefinition;
  readonly buildTaskDefinition: Ec2TaskDefinition;
  readonly integrationTestTaskDefinition: Ec2TaskDefinition;
  readonly deployStagingTaskDefinition: Ec2TaskDefinition;
  readonly deployProdTaskDefinition: Ec2TaskDefinition;

  constructor(scope: Construct, id: string, props?: EcsStackProps) {
    super(scope, id, props);

    // Prop validation
    if (!props?.vpc) {
      throw new Error('No VPC provided');
    }

    // Autoscaling group for ECS instances
    const autoScalingGroup = new AutoScalingGroup(this, 'AutoScalingGroup', {
      vpc: props.vpc,
      // Use public IP addresses or VPC internal interface
      associatePublicIpAddress: true,
      machineImage: EcsOptimizedImage.amazonLinux2(),
      instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.MICRO),
      userData: UserData.forLinux(),
      // Grant ec2 instances communication access to ECS cluster
      role: new Role(this, 'Ec2AccessRole', {
        assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
      }),
      minCapacity: 1,
      desiredCapacity: 1,
      maxCapacity: 10,
    });

    // ECS cluster for executing tasks
    this.cluster = new Cluster(this, 'ExecutorCluster', {
      vpc: props?.vpc,
      clusterName: 'executor-cluster',
      containerInsights: true,
    });

    // Register auto-scaling group as capacity provider for cluster
    const capacityProvider = new AsgCapacityProvider(
      this,
      'AsgCapacityProvider',
      { autoScalingGroup }
    );

    this.cluster.addAsgCapacityProvider(capacityProvider);

    // Task definitions
    const efsDnsName = `${props.efs.fileSystemId}.efs.${this.region}.amazonaws.com`;

    // Sample task definitions
    this.sampleSuccessTaskDefinition =
      taskDefinitions.createSuccessTaskDefinition(this);
    this.sampleFailureTaskDefinition =
      taskDefinitions.createFailureTaskDefinition(this);

    // Pipeline stage executor task definitions
    this.prepareTaskDefinition = taskDefinitions.createPrepareTaskDefinition(
      this,
      efsDnsName
    );
  }
}

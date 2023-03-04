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
  NetworkMode,
  ContainerImage,
  AwsLogDriver,
} from 'aws-cdk-lib/aws-ecs';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { AutoScalingGroup } from 'aws-cdk-lib/aws-autoscaling';
import { Construct } from 'constructs';

export interface EcsStackProps extends NestedStackProps {
  readonly vpc: IVpc;
}

export class EcsStack extends NestedStack {
  readonly cluster: Cluster;
  readonly sampleSuccessTaskDefinition: Ec2TaskDefinition;
  readonly sampleFailureTaskDefinition: Ec2TaskDefinition;
  readonly prepareTaskDefinition: Ec2TaskDefinition;
  readonly codeQualityTaskDefinition: Ec2TaskDefinition;
  readonly testTaskDefinition: Ec2TaskDefinition;
  readonly buildTaskDefinition: Ec2TaskDefinition;
  readonly deployTaskDefinition: Ec2TaskDefinition;

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

    // Sample task definitions for use in AWS step functions
    this.sampleSuccessTaskDefinition = new Ec2TaskDefinition(
      this,
      'SampleSuccess',
      {
        family: 'sample-success-task-definition',
        networkMode: NetworkMode.AWS_VPC,
      }
    );

    this.sampleSuccessTaskDefinition.addContainer('SampleSuccess', {
      image: ContainerImage.fromAsset('./lib/assets/sample_success'),
      cpu: 256,
      memoryLimitMiB: 512,
      logging: new AwsLogDriver({ streamPrefix: 'sample-success' }),
    });

    this.sampleFailureTaskDefinition = new Ec2TaskDefinition(
      this,
      'SampleFailure',
      {
        family: 'sample-failure-task-definition',
        networkMode: NetworkMode.AWS_VPC,
      }
    );

    this.sampleFailureTaskDefinition.addContainer('SampleFailure', {
      image: ContainerImage.fromAsset('./lib/assets/sample_failure'),
      cpu: 256,
      memoryLimitMiB: 512,
      logging: new AwsLogDriver({ streamPrefix: 'sample-failure' }),
    });

    // Pipeline stage executor task definitions

    /*
    this.prepareTaskDefinition = new Ec2TaskDefinition(this, 'Prepare', {
      family: 'prepare-task-definition',
      networkMode: NetworkMode.AWS_VPC,
    });

    this.prepareTaskDefinition.addContainer('prepare', {
      image: ContainerImage.fromAsset('./lib/assets/prepare'),
      cpu: 256,
      memoryLimitMiB: 512,
      logging: new AwsLogDriver({ streamPrefix: 'prepare' }),
    });

    this.codeQualityTaskDefinition = new Ec2TaskDefinition(
      this,
      'Code Quality',
      {
        family: 'code-quality-task-definition',
        networkMode: NetworkMode.AWS_VPC,
      }
    );

    this.codeQualityTaskDefinition.addContainer('code-quality', {
      image: ContainerImage.fromAsset('./lib/assets/code_quality'),
      cpu: 256,
      memoryLimitMiB: 512,
      logging: new AwsLogDriver({ streamPrefix: 'code-quality' }),
    });

    this.testTaskDefinition = new Ec2TaskDefinition(this, 'Test', {
      family: 'test-task-definition',
      networkMode: NetworkMode.AWS_VPC,
    });

    this.testTaskDefinition.addContainer('test', {
      image: ContainerImage.fromAsset('./lib/assets/test'),
      cpu: 256,
      memoryLimitMiB: 512,
      logging: new AwsLogDriver({ streamPrefix: 'test' }),
    });

    this.buildTaskDefinition = new Ec2TaskDefinition(this, 'Build', {
      family: 'build-task-definition',
      networkMode: NetworkMode.AWS_VPC,
    });

    this.buildTaskDefinition.addContainer('build', {
      image: ContainerImage.fromAsset('./lib/assets/build'),
      cpu: 256,
      memoryLimitMiB: 512,
      logging: new AwsLogDriver({ streamPrefix: 'build' }),
    });

    this.deployTaskDefinition = new Ec2TaskDefinition(this, 'Deploy', {
      family: 'deploy-task-definition',
      networkMode: NetworkMode.AWS_VPC,
    });

    this.deployTaskDefinition.addContainer('deploy', {
      image: ContainerImage.fromAsset('./lib/assets/deploy'),
      cpu: 256,
      memoryLimitMiB: 512,
      logging: new AwsLogDriver({ streamPrefix: 'deploy' }),
    });
    */
  }
}

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';

export interface EcsStackProps extends cdk.NestedStackProps {
  vpc: ec2.Vpc;
}

export class EcsStack extends cdk.NestedStack {
  cluster: ecs.Cluster;
  sampleSuccessTaskDefinition: ecs.TaskDefinition;
  sampleFailureTaskDefinition: ecs.TaskDefinition;
  prepareTaskDefinition: ecs.TaskDefinition;
  codeQualityTaskDefinition: ecs.TaskDefinition;
  testTaskDefinition: ecs.TaskDefinition;
  buildTaskDefinition: ecs.TaskDefinition;
  deployTaskDefinition: ecs.TaskDefinition;

  constructor(scope: Construct, id: string, props?: EcsStackProps) {
    super(scope, id, props);

    // Prop validation
    if (!props?.vpc) {
      throw new Error('No VPC provided');
    }

    // Autoscaling group for ECS instances to scale up/down to fit workloads
    const autoScalingGroup = new autoscaling.AutoScalingGroup(
      this,
      'Auto-Scaling-Group',
      {
        vpc: props.vpc,
        // Use public IP addresses or VPC internal interface
        associatePublicIpAddress: true,
        machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.T2,
          ec2.InstanceSize.SMALL
        ),
        userData: ec2.UserData.forLinux(),
        // grant ec2 instances communication access to ECS cluster
        role: new iam.Role(this, 'ec2AccessRole', {
          assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
        }),
        minCapacity: 1,
        desiredCapacity: 1,
        maxCapacity: 10,
      }
    );

    // ECS cluster for executing tasks
    this.cluster = new ecs.Cluster(this, 'Executor Cluster', {
      vpc: props?.vpc,
      clusterName: 'executor-cluster',
      containerInsights: true,
    });

    // Register auto-scaling group as capacity provider for cluster
    const capacityProvider = new ecs.AsgCapacityProvider(
      this,
      'AsgCapacityProvider',
      { autoScalingGroup }
    );

    this.cluster.addAsgCapacityProvider(capacityProvider);

    // Sample task definitions for use in AWS step functions

    this.sampleSuccessTaskDefinition = new ecs.Ec2TaskDefinition(
      this,
      'SampleSuccess',
      {
        family: 'sample-success-task-definition',
        networkMode: ecs.NetworkMode.AWS_VPC,
      }
    );

    this.sampleSuccessTaskDefinition.addContainer('sample-success', {
      image: ecs.ContainerImage.fromAsset('./lib/assets/sample_success'),
      cpu: 256,
      memoryLimitMiB: 512,
      logging: new ecs.AwsLogDriver({ streamPrefix: 'sample-success' }),
    });

    this.sampleFailureTaskDefinition = new ecs.Ec2TaskDefinition(
      this,
      'SampleFailure',
      {
        family: 'sample-failure-task-definition',
        networkMode: ecs.NetworkMode.AWS_VPC,
      }
    );

    this.sampleFailureTaskDefinition.addContainer('sample-failure', {
      image: ecs.ContainerImage.fromAsset('./lib/assets/sample_failure'),
      cpu: 256,
      memoryLimitMiB: 512,
      logging: new ecs.AwsLogDriver({ streamPrefix: 'sample-failure' }),
    });

    // Pipeline stage executor task definitions

    /*
    this.prepareTaskDefinition = new ecs.Ec2TaskDefinition(this, 'Prepare', {
      family: 'prepare-task-definition',
      networkMode: ecs.NetworkMode.AWS_VPC,
    });

    this.prepareTaskDefinition.addContainer('prepare', {
      image: ecs.ContainerImage.fromAsset('./lib/assets/prepare'),
      cpu: 256,
      memoryLimitMiB: 512,
      logging: new ecs.AwsLogDriver({ streamPrefix: 'prepare' }),
    });

    this.codeQualityTaskDefinition = new ecs.Ec2TaskDefinition(
      this,
      'Code Quality',
      {
        family: 'code-quality-task-definition',
        networkMode: ecs.NetworkMode.AWS_VPC,
      }
    );

    this.codeQualityTaskDefinition.addContainer('code-quality', {
      image: ecs.ContainerImage.fromAsset('./lib/assets/code_quality'),
      cpu: 256,
      memoryLimitMiB: 512,
      logging: new ecs.AwsLogDriver({ streamPrefix: 'code-quality' }),
    });

    this.testTaskDefinition = new ecs.Ec2TaskDefinition(this, 'Test', {
      family: 'test-task-definition',
      networkMode: ecs.NetworkMode.AWS_VPC,
    });

    this.testTaskDefinition.addContainer('test', {
      image: ecs.ContainerImage.fromAsset('./lib/assets/test'),
      cpu: 256,
      memoryLimitMiB: 512,
      logging: new ecs.AwsLogDriver({ streamPrefix: 'test' }),
    });

    this.buildTaskDefinition = new ecs.Ec2TaskDefinition(this, 'Build', {
      family: 'build-task-definition',
      networkMode: ecs.NetworkMode.AWS_VPC,
    });

    this.buildTaskDefinition.addContainer('build', {
      image: ecs.ContainerImage.fromAsset('./lib/assets/build'),
      cpu: 256,
      memoryLimitMiB: 512,
      logging: new ecs.AwsLogDriver({ streamPrefix: 'build' }),
    });

    this.deployTaskDefinition = new ecs.Ec2TaskDefinition(this, 'Deploy', {
      family: 'deploy-task-definition',
      networkMode: ecs.NetworkMode.AWS_VPC,
    });

    this.deployTaskDefinition.addContainer('deploy', {
      image: ecs.ContainerImage.fromAsset('./lib/assets/deploy'),
      cpu: 256,
      memoryLimitMiB: 512,
      logging: new ecs.AwsLogDriver({ streamPrefix: 'deploy' }),
    });
    */
  }
}

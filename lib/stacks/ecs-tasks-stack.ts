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
}

export class EcsTasksStack extends NestedStack {
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

  constructor(scope: Construct, id: string, props?: EcsTasksStackProps) {
    super(scope, id, props);

    // Prop validation
    if (!props?.vpc) {
      throw new Error('No VPC provided');
    }

    // Autoscaling group for ECS instances
    const autoScalingGroup = new AutoScalingGroup(this, 'AutoScalingGroup', {
      vpc: props.vpc,
      // TODO: Switch to private subnet
      associatePublicIpAddress: true,
      vpcSubnets: {
        subnetType: SubnetType.PUBLIC,
      },
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

    // Permissions
    const taskDefinitionPolicyDocument = new PolicyDocument({
      statements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [
            'ecr:*',
            'ec2:*',
            'ecs:*',
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

    const efsDnsName = `${props.efs.fileSystemId}.efs.${this.region}.amazonaws.com`;

    // Sample task definitions. Deploy stages don't need EFS.
    const createTaskDefinition = (
      stageName: string,
      taskDefinitionId: string,
      useEfs = true
    ) => {
      return taskDefinitions.create(
        this,
        stageName,
        taskDefinitionId,
        useEfs ? efsDnsName : '',
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

    this.buildTaskDefinition = taskDefinitions.createBuildTaskDefinition(
      this,
      efsDnsName,
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

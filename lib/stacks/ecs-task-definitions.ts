import { NestedStack } from 'aws-cdk-lib';
import {
  Ec2TaskDefinition,
  ContainerImage,
  NetworkMode,
  Scope,
  DockerVolumeConfiguration,
  MountPoint,
  AwsLogDriver,
  FireLensLogDriver,
  FirelensLogRouter,
  FirelensLogRouterType,
} from 'aws-cdk-lib/aws-ecs';
import {
  PolicyStatement,
  PolicyDocument,
  Policy,
  Role,
  ServicePrincipal,
  Effect,
} from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

import { config } from 'dotenv';
config();

// Configure shared Docker volume
const createDockerVolumeMountPoint = (): MountPoint => {
  return {
    sourceVolume: 'seamless-efs-docker-volume',
    containerPath: '/data',
    readOnly: false,
  };
};

const createDockerVolumeConfig = (
  efsDnsName: string
): DockerVolumeConfiguration => {
  return {
    driver: 'local',
    scope: Scope.SHARED,
    autoprovision: true,
    driverOpts: {
      device: ':/',
      o: `addr=${efsDnsName},nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport`,
      type: 'nfs',
    },
  };
};

// Configure logging container
const createLoggingContainer = (
  containerName: string,
  scope: Construct,
  taskDefinition: Ec2TaskDefinition
): FirelensLogRouter => {
  return new FirelensLogRouter(scope, containerName, {
    memoryLimitMiB: 256,
    firelensConfig: {
      type: FirelensLogRouterType.FLUENTBIT,
      options: {
        enableECSLogMetadata: true,
      },
    },
    image: ContainerImage.fromRegistry(
      'public.ecr.aws/aws-observability/aws-for-fluent-bit:latest'
    ),
    taskDefinition,
  });
};

const createLogDriver = (): FireLensLogDriver => {
  const logSubscriberUrl = process.env.LOG_SUBSCRIBER_URL || '';

  return new FireLensLogDriver({
    options: {
      Name: 'Http',
      Host:
        logSubscriberUrl.slice(0, 8) === 'https://'
          ? logSubscriberUrl.slice(8)
          : logSubscriberUrl,
      Format: 'json_lines',
      Port: '443',
      URI: '/logs',
      tls: 'on',
      'tls.verify': 'off',
    },
  });
};

// Prepare stage
const createPrepareTaskDefinition = (
  ecsStack: NestedStack,
  efsDnsName: string
) => {
  const prepareTaskDefinition = new Ec2TaskDefinition(ecsStack, 'Prepare', {
    family: 'seamless-taskdefinition-prepare',
    networkMode: NetworkMode.BRIDGE,
  });

  // Add Docker volume
  const dockerVolumeConfiguration = createDockerVolumeConfig(efsDnsName);

  prepareTaskDefinition.addVolume({
    name: 'seamless-efs-docker-volume',
    dockerVolumeConfiguration,
  });

  // Add application container
  const logDriver = createLogDriver();

  const prepareContainer = prepareTaskDefinition.addContainer('prepare', {
    image: ContainerImage.fromAsset('./lib/assets/prepare'),
    cpu: 256,
    memoryLimitMiB: 512,
    logging: logDriver,
  });

  prepareContainer.addMountPoints(createDockerVolumeMountPoint());

  // Add sidecar logging container
  const loggingContainer = createLoggingContainer(
    'SeamlessLoggerPrepare',
    ecsStack,
    prepareTaskDefinition
  );

  return prepareTaskDefinition;
};

// Code Quality stage
const createCodeQualityTaskDefinition = (
  ecsStack: NestedStack,
  efsDnsName: string
) => {
  const codeQualityTaskDefinition = new Ec2TaskDefinition(
    ecsStack,
    'CodeQuality',
    {
      family: 'seamless-taskdefinition-codequality',
      networkMode: NetworkMode.BRIDGE,
    }
  );

  // Add Docker volume
  const dockerVolumeConfiguration = createDockerVolumeConfig(efsDnsName);

  codeQualityTaskDefinition.addVolume({
    name: 'seamless-efs-docker-volume',
    dockerVolumeConfiguration,
  });

  // Add application container
  const logDriver = createLogDriver();

  const codeQualityContainer = codeQualityTaskDefinition.addContainer(
    'codeQuality',
    {
      image: ContainerImage.fromAsset('./lib/assets/code_quality'),
      cpu: 256,
      memoryLimitMiB: 512,
      logging: logDriver,
    }
  );

  codeQualityContainer.addMountPoints(createDockerVolumeMountPoint());

  // Add sidecar logging container
  const loggingContainer = createLoggingContainer(
    'SeamlessLoggerCodeQuality',
    ecsStack,
    codeQualityTaskDefinition
  );

  return codeQualityTaskDefinition;
};

// Unit Test stage
const createUnitTestTaskDefinition = (
  ecsStack: NestedStack,
  efsDnsName: string
) => {
  const unitTestTaskDefinition = new Ec2TaskDefinition(ecsStack, 'UnitTest', {
    family: 'seamless-taskdefinition-unittest',
    networkMode: NetworkMode.BRIDGE,
  });

  // Add Docker volume
  const dockerVolumeConfiguration = createDockerVolumeConfig(efsDnsName);

  unitTestTaskDefinition.addVolume({
    name: 'seamless-efs-docker-volume',
    dockerVolumeConfiguration,
  });

  // Add application container
  const logDriver = createLogDriver();

  const unitTestContainer = unitTestTaskDefinition.addContainer('unitTest', {
    image: ContainerImage.fromAsset('./lib/assets/unit_test'),
    cpu: 256,
    memoryLimitMiB: 512,
    logging: logDriver,
  });

  unitTestContainer.addMountPoints(createDockerVolumeMountPoint());

  // Add sidecar logging container
  const loggingContainer = createLoggingContainer(
    'SeamlessLoggerUnitTest',
    ecsStack,
    unitTestTaskDefinition
  );

  return unitTestTaskDefinition;
};

// Build stage
const createBuildTaskDefinition = (
  ecsStack: NestedStack,
  efsDnsName: string
) => {
  // IAM policy statement for full access to ECR
  const ecrFullAccessPolicyDocument = new PolicyDocument({
    statements: [
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['ecr:*'],
        resources: ['*'],
      }),
    ],
  });

  const buildTaskDefinition = new Ec2TaskDefinition(ecsStack, 'Build', {
    family: 'seamless-taskdefinition-build',
    networkMode: NetworkMode.BRIDGE,
    taskRole: new Role(ecsStack, 'EcrFullAccessTaskRole', {
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
      inlinePolicies: {
        EcrFullAccess: ecrFullAccessPolicyDocument,
      },
    }),
  });

  // Add Docker volume
  const dockerVolumeConfiguration = createDockerVolumeConfig(efsDnsName);

  buildTaskDefinition.addVolume({
    name: 'seamless-efs-docker-volume',
    dockerVolumeConfiguration,
  });

  // Add bind mount host volume
  buildTaskDefinition.addVolume({
    name: 'docker-socket',
    host: {
      sourcePath: '/var/run/docker.sock',
    },
  });

  // Add application container
  const logDriver = createLogDriver();

  const buildContainer = buildTaskDefinition.addContainer('build', {
    image: ContainerImage.fromAsset('./lib/assets/build'),
    cpu: 256,
    memoryLimitMiB: 512,
    logging: logDriver,
  });

  // Add mount points to container
  const dockerSocketMountPoint: MountPoint = {
    sourceVolume: 'docker-socket',
    containerPath: '/var/run/docker.sock',
    readOnly: false,
  };

  buildContainer.addMountPoints(createDockerVolumeMountPoint());
  buildContainer.addMountPoints(dockerSocketMountPoint);

  // Add sidecar logging container
  const loggingContainer = createLoggingContainer(
    'SeamlessLoggerBuild',
    ecsStack,
    buildTaskDefinition
  );

  return buildTaskDefinition;
};

// Sample definitions for testing
const createSuccessTaskDefinition = (ecsStack: NestedStack) => {
  const sampleSuccessTaskDefinition = new Ec2TaskDefinition(
    ecsStack,
    'SampleSuccess',
    {
      family: 'seamless-sample-success-task-definition',
      networkMode: NetworkMode.BRIDGE,
    }
  );

  sampleSuccessTaskDefinition.addContainer('sample-success', {
    image: ContainerImage.fromAsset('./lib/assets/sample_success'),
    cpu: 256,
    memoryLimitMiB: 512,
    logging: new AwsLogDriver({ streamPrefix: 'sample-success' }),
  });

  return sampleSuccessTaskDefinition;
};

const createFailureTaskDefinition = (ecsStack: NestedStack) => {
  const sampleFailureTaskDefinition = new Ec2TaskDefinition(
    ecsStack,
    'SampleFailure',
    {
      family: 'seamless-sample-failure-task-definition',
      networkMode: NetworkMode.BRIDGE,
    }
  );

  sampleFailureTaskDefinition.addContainer('sample-failure', {
    image: ContainerImage.fromAsset('./lib/assets/sample_failure'),
    cpu: 256,
    memoryLimitMiB: 512,
    logging: new AwsLogDriver({ streamPrefix: 'sample-failure' }),
  });

  return sampleFailureTaskDefinition;
};

export default {
  createPrepareTaskDefinition,
  createCodeQualityTaskDefinition,
  createUnitTestTaskDefinition,
  createBuildTaskDefinition,
  createSuccessTaskDefinition,
  createFailureTaskDefinition,
};

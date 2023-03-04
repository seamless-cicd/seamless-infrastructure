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
  ContainerDefinition,
} from 'aws-cdk-lib/aws-ecs';
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
  scope: Construct,
  taskDefinition: Ec2TaskDefinition
): FirelensLogRouter => {
  return new FirelensLogRouter(scope, 'SeamlessLogRouter', {
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

// Pipeline stages
const createPrepareTaskDefinition = (
  ecsStack: NestedStack,
  efsDnsName: string
) => {
  const prepareTaskDefinition = new Ec2TaskDefinition(ecsStack, 'Prepare', {
    family: 'seamless-prepare-task-definition',
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
    ecsStack,
    prepareTaskDefinition
  );

  return prepareTaskDefinition;
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
  createSuccessTaskDefinition,
  createFailureTaskDefinition,
};

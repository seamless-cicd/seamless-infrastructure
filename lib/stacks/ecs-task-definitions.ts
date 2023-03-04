import { NestedStack } from 'aws-cdk-lib';
import {
  Ec2TaskDefinition,
  NetworkMode,
  Scope,
  DockerVolumeConfiguration,
  MountPoint,
  AwsLogDriver,
  ContainerImage,
} from 'aws-cdk-lib/aws-ecs';

// Volume configuration
const dockerVolumeMountPoint: MountPoint = {
  sourceVolume: 'seamless-efs-docker-volume',
  containerPath: '/data',
  readOnly: false,
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

// Pipeline stages
const createPrepareTaskDefinition = (
  ecsStack: NestedStack,
  efsDnsName: string
) => {
  const prepareTaskDefinition = new Ec2TaskDefinition(ecsStack, 'Prepare', {
    family: 'seamless-prepare-task-definition',
    networkMode: NetworkMode.BRIDGE,
  });

  const dockerVolumeConfiguration = createDockerVolumeConfig(efsDnsName);

  prepareTaskDefinition.addVolume({
    name: 'seamless-efs-docker-volume',
    dockerVolumeConfiguration,
  });

  const prepareContainer = prepareTaskDefinition.addContainer('prepare', {
    image: ContainerImage.fromAsset('./lib/assets/prepare'),
    cpu: 256,
    memoryLimitMiB: 512,
    logging: new AwsLogDriver({ streamPrefix: 'prepare' }),
  });

  prepareContainer.addMountPoints(dockerVolumeMountPoint);

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

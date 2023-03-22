import { NestedStack } from 'aws-cdk-lib';
import {
  AwsLogDriver,
  ContainerImage,
  DockerVolumeConfiguration,
  Ec2TaskDefinition,
  MountPoint,
  NetworkMode,
  Scope,
} from 'aws-cdk-lib/aws-ecs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { capitalize, pascalToKebab } from '../utils/utils';

import { config } from 'dotenv';
config();

// Configure shared Docker volume
const createDockerVolumeMountPoint = (): MountPoint => {
  return {
    sourceVolume: 'SeamlessEfsDockerVolume',
    containerPath: '/data',
    readOnly: false,
  };
};

const createDockerVolumeConfig = (
  efsDnsName: string,
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

// Task definition template
const create = (
  ecsTasksStack: NestedStack,
  id: string,
  efsDnsName: string,
  logSubscriberUrl: string,
  taskRolePolicyStatement: PolicyStatement,
) => {
  // Convert PascalCase to kebab-case, e.g. CodeQuality -> code-quality
  const idKebab = pascalToKebab(id);

  const taskDefinition = new Ec2TaskDefinition(ecsTasksStack, id, {
    family: `SeamlessExecutor${id}`,
    networkMode: NetworkMode.BRIDGE,
  });
  taskDefinition.addToTaskRolePolicy(taskRolePolicyStatement);

  // Add application container
  const container = taskDefinition.addContainer(`SeamlessExecutor${id}`, {
    image: ContainerImage.fromAsset(`./lib/assets/${idKebab}`),
    cpu: 256,
    memoryLimitMiB: 512,
    logging: new AwsLogDriver({
      streamPrefix: `SeamlessExecutor${id}`,
    }),
    environment: {
      LOG_SUBSCRIBER_URL: logSubscriberUrl,
    },
  });

  if (efsDnsName) {
    // Add shared Docker volume
    taskDefinition.addVolume({
      name: 'SeamlessEfsDockerVolume',
      dockerVolumeConfiguration: createDockerVolumeConfig(efsDnsName),
    });

    container.addMountPoints(createDockerVolumeMountPoint());
  }

  return { taskDefinition, container };
};

// Build stage: Uses above template, plus an additional bind mount for Docker-in-Docker
const createDockerInDocker = (
  ecsTasksStack: NestedStack,
  id: string,
  efsDnsName: string,
  logSubscriberUrl: string,
  taskRolePolicyStatement: PolicyStatement,
) => {
  const { taskDefinition, container } = create(
    ecsTasksStack,
    id,
    efsDnsName,
    logSubscriberUrl,
    taskRolePolicyStatement,
  );

  // Add bind mount
  taskDefinition.addVolume({
    name: 'DockerSocket',
    host: {
      sourcePath: '/var/run/docker.sock',
    },
  });

  const dockerSocketMountPoint: MountPoint = {
    sourceVolume: 'DockerSocket',
    containerPath: '/var/run/docker.sock',
    readOnly: false,
  };

  container.addMountPoints(dockerSocketMountPoint);

  return taskDefinition;
};

export default {
  create,
  createDockerInDocker,
};

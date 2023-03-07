import { NestedStack } from 'aws-cdk-lib';
import {
  Ec2TaskDefinition,
  ContainerImage,
  NetworkMode,
  Scope,
  DockerVolumeConfiguration,
  MountPoint,
  AwsLogDriver,
} from 'aws-cdk-lib/aws-ecs';
import { Role } from 'aws-cdk-lib/aws-iam';

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

// Task definition template
const create = (
  ecsStack: NestedStack,
  stageName: string,
  taskDefinitionId: string,
  efsDnsName: string,
  taskRole: Role
) => {
  const taskDefinition = new Ec2TaskDefinition(ecsStack, taskDefinitionId, {
    family: `seamless-taskdefinition-${stageName}`,
    networkMode: NetworkMode.BRIDGE,
    taskRole,
  });

  // Add shared Docker volume
  taskDefinition.addVolume({
    name: 'seamless-efs-docker-volume',
    dockerVolumeConfiguration: createDockerVolumeConfig(efsDnsName),
  });

  // Add application container
  const container = taskDefinition.addContainer(stageName, {
    image: ContainerImage.fromAsset(`./lib/assets/${stageName}`),
    cpu: 256,
    memoryLimitMiB: 512,
    logging: new AwsLogDriver({
      streamPrefix: `seamless-logs-${stageName}`,
    }),
  });

  container.addMountPoints(createDockerVolumeMountPoint());

  return { taskDefinition, container };
};

// Build stage: Uses above template, plus an additional bind mount for Docker-in-Docker
const createBuildTaskDefinition = (
  ecsStack: NestedStack,
  efsDnsName: string,
  taskRole: Role
) => {
  const { taskDefinition, container } = create(
    ecsStack,
    'build',
    'Build',
    efsDnsName,
    taskRole
  );

  // Add bind mount
  taskDefinition.addVolume({
    name: 'docker-socket',
    host: {
      sourcePath: '/var/run/docker.sock',
    },
  });

  const dockerSocketMountPoint: MountPoint = {
    sourceVolume: 'docker-socket',
    containerPath: '/var/run/docker.sock',
    readOnly: false,
  };

  container.addMountPoints(dockerSocketMountPoint);

  return taskDefinition;
};

// Deploy to Prod stage
// const createDeployProdTaskDefinition = (
//   ecsStack: NestedStack,
//   efsDnsName: string,
//   taskRole: Role
// ) => {
//   return create(ecsStack, 'deploy-prod', 'DeployProd', efsDnsName, taskRole)
//     .taskDefinition;
// };

export default {
  create,
  createBuildTaskDefinition,
  // createDeployProdTaskDefinition,
};

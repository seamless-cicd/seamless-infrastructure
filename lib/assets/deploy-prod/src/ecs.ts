import { DescribeImagesCommand, ECRClient } from '@aws-sdk/client-ecr';
import {
  DescribeServicesCommand,
  DescribeTaskDefinitionCommand,
  ECSClient,
  RegisterTaskDefinitionCommand,
  RegisterTaskDefinitionCommandInput,
  TaskDefinition,
  UpdateServiceCommand,
} from '@aws-sdk/client-ecs';

// All possible properties of RegisterTaskDefinitionCommandInput
const taskDefinitionProperties = [
  'containerDefinitions',
  'cpu',
  'ephemeralStorage',
  'executionRoleArn',
  'family',
  'inferenceAccelerators',
  'ipcMode',
  'memory',
  'networkMode',
  'pidMode',
  'placementConstraints',
  'proxyConfiguration',
  'requiresCompatibilities',
  'runtimePlatform',
  'tags',
  'taskRoleArn',
  'volumes',
];

// Clients
const createEcsClient = (awsRegion: string) =>
  new ECSClient({ region: awsRegion });

const createEcrClient = (awsRegion: string) =>
  new ECRClient({ region: awsRegion });

// ECR operations
// Check if tagged image (e.g. "my-image:1.0") exists in the specified ECR repository
const imageExistsInEcr = async (
  awsAccountId: string,
  awsRegion: string,
  repositoryUri: string,
  imageTag: string,
) => {
  const ecrClient = createEcrClient(awsRegion);
  const repositoryName = repositoryUri.slice(repositoryUri.indexOf('/') + 1);

  const params = {
    registryId: awsAccountId,
    repositoryName,
    imageIds: [
      {
        imageTag,
      },
    ],
  };

  const command = new DescribeImagesCommand(params);
  const { imageDetails } = await ecrClient.send(command);
  console.log(imageDetails);

  if (!imageDetails || imageDetails.length === 0) {
    return false;
  } else {
    return true;
  }
};

const isEcrRepo = (awsAccountId: string, repositoryUri: string) => {
  const prefix = `^${awsAccountId}.dkr.ecr`;
  return new RegExp(prefix).test(repositoryUri);
};

// ECS operations
const findService = async (
  ecsClient: ECSClient,
  serviceName: string,
  clusterName: string,
) => {
  const { services } = await ecsClient.send(
    new DescribeServicesCommand({
      services: [serviceName],
      cluster: clusterName,
    }),
  );
  if (!services || services.length === 0) {
    throw new Error(
      `ECS Service ${serviceName} was not found in Cluster ${clusterName}`,
    );
  }

  return services[0];
};

const findTaskDefinitionForService = async (
  ecsClient: ECSClient,
  serviceName: string,
  clusterName: string,
) => {
  const service = await findService(ecsClient, serviceName, clusterName);

  const currentTaskDefinitionArn = service.taskDefinition;

  const { taskDefinition: currentTaskDefinition } = await ecsClient.send(
    new DescribeTaskDefinitionCommand({
      taskDefinition: currentTaskDefinitionArn,
    }),
  );
  if (!currentTaskDefinition) {
    throw new Error(
      `No Task Definition found for ARN ${currentTaskDefinitionArn}`,
    );
  }

  return currentTaskDefinition;
};

// Create a new Task Definition, preserving as much as possible from the current one
const updateTaskDefinitionWithNewImageTag = (
  awsAccountId: string,
  awsRegion: string,
  taskDefinition: TaskDefinition,
  newTag: string,
) => {
  const newTaskDefinition = Object.fromEntries(
    Object.entries(taskDefinition).filter((entry) =>
      taskDefinitionProperties.includes(entry[0]),
    ),
  );

  // Assume the Task Definition only has 1 container, so select the first one
  const currentImage: string = newTaskDefinition.containerDefinitions[0].image;
  const currentRepoUri = currentImage.split(':')[0];
  const newImage = `${currentRepoUri}:${newTag}`;

  // Check if rollback target image exists
  if (
    isEcrRepo(awsAccountId, currentRepoUri) &&
    !imageExistsInEcr(awsAccountId, awsRegion, currentRepoUri, newTag)
  ) {
    throw new Error(`image ${newImage} does not exist`);
  }

  newTaskDefinition.containerDefinitions[0].image = newImage;
  return newTaskDefinition;
};

// Register new Task Definition on ECR
const registerTaskDefinition = async (
  ecsClient: ECSClient,
  taskDefinition: TaskDefinition,
) => {
  const { taskDefinition: registeredTaskDefinition } = await ecsClient.send(
    new RegisterTaskDefinitionCommand(
      taskDefinition as RegisterTaskDefinitionCommandInput,
    ),
  );

  if (!registeredTaskDefinition) {
    throw new Error('Failed to register new Task Definition');
  }

  return registeredTaskDefinition;
};

// Update the ECS Service using the newly-registered Task Definition's ARN
const updateServiceWithNewTaskDefinition = async (
  ecsClient: ECSClient,
  serviceName: string,
  clusterName: string,
  taskDefinition: TaskDefinition,
) => {
  const response = await ecsClient.send(
    new UpdateServiceCommand({
      service: serviceName,
      cluster: clusterName,
      taskDefinition: taskDefinition.taskDefinitionArn,
      forceNewDeployment: true,
    }),
  );

  return response;
};

export default {
  createEcsClient,
  findService,
  findTaskDefinitionForService,
  updateTaskDefinitionWithNewImageTag,
  registerTaskDefinition,
  updateServiceWithNewTaskDefinition,
};

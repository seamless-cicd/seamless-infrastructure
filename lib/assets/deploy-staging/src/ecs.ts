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

const { AWS_ACCOUNT_ID, AWS_REGION } = process.env;

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
const createEcsClient = () => new ECSClient({ region: AWS_REGION });

const createEcrClient = () => new ECRClient({ region: AWS_REGION });

// ECR operations
// Check if tagged image (e.g. "my-image:1.0") exists in the specified ECR repository
const imageExistsInEcr = async (repositoryName: string, imageTag: string) => {
  const ecrClient = createEcrClient();

  const command = new DescribeImagesCommand({
    registryId: AWS_ACCOUNT_ID,
    repositoryName,
    imageIds: [
      {
        imageTag,
      },
    ],
  });

  const { imageDetails } = await ecrClient.send(command);

  if (!imageDetails || imageDetails.length === 0) {
    return false;
  } else {
    return true;
  }
};

const isEcrRepo = (repositoryUri: string) => {
  const prefix = `^${AWS_ACCOUNT_ID}.dkr.ecr`;
  return new RegExp(prefix).test(repositoryUri);
};

const getAllImages = async (repositoryName: string) => {
  const images = [];
  let nextToken;

  const ecrClient = createEcrClient();

  // Paginate to retrieve all results
  do {
    const command = new DescribeImagesCommand({
      registryId: AWS_ACCOUNT_ID,
      repositoryName,
      nextToken: nextToken,
    }) as DescribeImagesCommand;

    const { imageDetails, nextToken: newNextToken } = await ecrClient.send(
      command,
    );
    images.push(...(imageDetails || []));
    nextToken = newNextToken;
  } while (nextToken);

  return images;
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
  const repositoryName = currentRepoUri.slice(currentRepoUri.indexOf('/') + 1);

  // Check if rollback target image exists
  if (isEcrRepo(currentRepoUri) && !imageExistsInEcr(repositoryName, newTag)) {
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
  getAllImages,
};

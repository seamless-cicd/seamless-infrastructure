import dotenv from 'dotenv';
dotenv.config();

import {
  DescribeServicesCommand,
  DescribeTaskDefinitionCommand,
  ECSClient,
  RegisterTaskDefinitionCommand,
  RegisterTaskDefinitionCommandInput,
  UpdateServiceCommand,
} from '@aws-sdk/client-ecs';
import { LogEmitter } from '@seamless-cicd/execa-logged-process';

const {
  AWS_REGION,
  AWS_ACCOUNT_ID,
  AWS_ECS_CLUSTER,
  AWS_ECS_SERVICE,
  AWS_ECR_REPO,
  STAGE_ID,
  LOG_SUBSCRIBER_URL,
  COMMIT_HASH,
} = process.env;

const logger = new LogEmitter(LOG_SUBSCRIBER_URL);

// Logger wrapper that sends along stage ID
const log = async (message: string) => {
  await logger.emit(message, 'stdout', { stageId: STAGE_ID });
};

async function deployProd(): Promise<void> {
  try {
    await log(`Deploy to Prod stage starting; stage ID: ${STAGE_ID}`);

    const ecsClient = new ECSClient({ region: AWS_REGION });

    // Retrieve data about the ECS Service
    const { services } = await ecsClient.send(
      new DescribeServicesCommand({
        services: [AWS_ECS_SERVICE],
        cluster: AWS_ECS_CLUSTER,
      }),
    );
    if (!services || services.length === 0) {
      throw new Error('No Services found');
    }

    await log(`Found Service: ${services[0]}`);

    // Extract data about the Service's Task Definition
    const currentTaskDefinitionArn = services[0].taskDefinition;

    const { taskDefinition: currentTaskDefinition } = await ecsClient.send(
      new DescribeTaskDefinitionCommand({
        taskDefinition: currentTaskDefinitionArn,
      }),
    );
    if (!currentTaskDefinition) {
      throw new Error('No Task Definition found');
    }

    // Create a new Task Definition, preserving as much as possible from the current one
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

    const newTaskDefinition = Object.fromEntries(
      Object.entries(currentTaskDefinition).filter((entry) =>
        taskDefinitionProperties.includes(entry[0]),
      ),
    );

    await log(`New Task Definition: ${newTaskDefinition}`);

    // Assume only 1 container
    const currentImage = newTaskDefinition.containerDefinitions[0].image;
    const newImage = `${currentImage?.split(':')[0]}:${COMMIT_HASH}`;
    newTaskDefinition.containerDefinitions[0].image = newImage;

    // Register new Task Definition on ECR
    const { taskDefinition: registeredTaskDefinition } = await ecsClient.send(
      new RegisterTaskDefinitionCommand(
        newTaskDefinition as RegisterTaskDefinitionCommandInput,
      ),
    );
    if (!registeredTaskDefinition) {
      throw new Error('Failed to register new Task Definition');
    }

    await log(`Registered New Task Definition: ${registeredTaskDefinition}`);

    // Update the ECS Service using the newly-registered Task Definition's ARN
    const updateServiceCommand = new UpdateServiceCommand({
      service: AWS_ECS_SERVICE,
      cluster: AWS_ECS_CLUSTER,
      taskDefinition: registeredTaskDefinition.taskDefinitionArn,
      forceNewDeployment: true,
    });

    await log(
      `Issuing deploy command:\n${JSON.stringify(
        updateServiceCommand,
        null,
        2,
      )}`,
    );

    const response = await ecsClient.send(updateServiceCommand);

    await log(
      `Service update successful:\n${JSON.stringify(response, null, 2)}`,
    );
  } catch (error) {
    await logger.emit(
      `Error updating service:\n${JSON.stringify(error, null, 2)}`,
      'stderr',
      { stageId: STAGE_ID },
    );
  }
}

deployProd();

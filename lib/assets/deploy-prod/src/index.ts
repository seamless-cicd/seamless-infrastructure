import dotenv from 'dotenv';
dotenv.config();

import { LogEmitter } from '@seamless-cicd/execa-logged-process';
import ecsService from './ecs.js';

const {
  AWS_REGION,
  AWS_ACCOUNT_ID,
  AWS_ECS_CLUSTER,
  AWS_ECS_SERVICE,
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

    const ecsClient = ecsService.createEcsClient(AWS_REGION);

    // Find Task Definition currently used by Service
    const taskDefinition = await ecsService.findTaskDefinitionForService(
      ecsClient,
      AWS_ECS_SERVICE,
      AWS_ECS_CLUSTER,
    );

    await log(
      `Current Task Definition: ${JSON.stringify(taskDefinition, null, 2)}`,
    );

    // Update with new tag (git commit hash)
    const newTaskDefinition =
      await ecsService.updateTaskDefinitionWithNewImageTag(
        AWS_ACCOUNT_ID,
        AWS_REGION,
        taskDefinition,
        COMMIT_HASH,
      );

    await log(
      `New Task Definition: ${JSON.stringify(newTaskDefinition, null, 2)}`,
    );

    // Register new Task Definition on ECR
    const registeredTaskDefinition = await ecsService.registerTaskDefinition(
      ecsClient,
      newTaskDefinition,
    );

    await log(`Registered new Task Definition`);

    // Update the ECS Service
    const response = await ecsService.updateServiceWithNewTaskDefinition(
      ecsClient,
      AWS_ECS_SERVICE,
      AWS_ECS_CLUSTER,
      registeredTaskDefinition,
    );

    await log(
      `Service update initiated:\n${JSON.stringify(response, null, 2)}`,
    );
  } catch (error) {
    await logger.emit(
      `Error updating service:\n${JSON.stringify(error, null, 2)}`,
      'stderr',
      { stageId: STAGE_ID },
    );
    process.exit(1);
  }
}

deployProd();

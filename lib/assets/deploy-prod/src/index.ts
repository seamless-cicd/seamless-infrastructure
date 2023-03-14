import dotenv from 'dotenv';
dotenv.config();

import { ECSClient, UpdateServiceCommand } from '@aws-sdk/client-ecs';
import { LogEmitter } from '@seamless-cicd/execa-logged-process';

const {
  AWS_REGION,
  AWS_ACCOUNT_ID,
  AWS_ECS_CLUSTER,
  AWS_ECS_SERVICE,
  STAGE_ID,
  LOG_SUBSCRIBER_URL,
} = process.env;

const logger = new LogEmitter(LOG_SUBSCRIBER_URL);

async function deployProd(): Promise<void> {
  await logger.emit(`Deploy to Prod stage starting; stage ID: ${STAGE_ID}`);

  const ecs = new ECSClient({ region: AWS_REGION });

  const serviceArn = `arn:aws:ecs:${AWS_REGION}:${AWS_ACCOUNT_ID}:service/${AWS_ECS_SERVICE}`;
  const clusterArn = `arn:aws:ecs:${AWS_REGION}:${AWS_ACCOUNT_ID}:cluster/${AWS_ECS_CLUSTER}`;

  try {
    // Restart the Fargate service without changing its Task Definition
    const updateServiceCommand = new UpdateServiceCommand({
      service: serviceArn,
      cluster: clusterArn,
      forceNewDeployment: true,
    });

    await logger.emit(
      `Issuing deploy command:\n${JSON.stringify(
        updateServiceCommand,
        null,
        2,
      )}`,
    );
    const response = await ecs.send(updateServiceCommand);
    await logger.emit(
      `Service update successful:\n${JSON.stringify(response, null, 2)}`,
    );
  } catch (error) {
    await logger.emit(
      `Error updating service:\n${JSON.stringify(error, null, 2)}`,
      { type: 'stderr' },
    );
  }
}

deployProd();

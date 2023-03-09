import dotenv from 'dotenv';
dotenv.config();

import { ECSClient, UpdateServiceCommand } from '@aws-sdk/client-ecs';
import { emitLog } from './logging-agent.js';

const {
  STAGE_ID,
  AWS_REGION,
  AWS_ACCOUNT_ID,
  AWS_ECS_CLUSTER_STAGING,
  AWS_ECS_SERVICE_STAGING,
} = process.env;

async function deployStaging(): Promise<void> {
  await emitLog(`Deploy to Staging stage starting; stage ID: ${STAGE_ID}`);

  const ecs = new ECSClient({ region: AWS_REGION });

  const serviceArn = `arn:aws:ecs:${AWS_REGION}:${AWS_ACCOUNT_ID}:service/${AWS_ECS_SERVICE_STAGING}`;
  const clusterArn = `arn:aws:ecs:${AWS_REGION}:${AWS_ACCOUNT_ID}:cluster/${AWS_ECS_CLUSTER_STAGING}`;

  try {
    // Restart the Fargate service without changing its Task Definition
    // Assumes that the image on ECR hasn't changed and is still tagged ":latest"
    const updateServiceCommand = new UpdateServiceCommand({
      service: serviceArn,
      cluster: clusterArn,
      forceNewDeployment: true,
    });

    await emitLog(
      `Issuing deploy command:\n${JSON.stringify(
        updateServiceCommand,
        null,
        2
      )}`
    );
    const response = await ecs.send(updateServiceCommand);
    await emitLog(
      `Service update successful:\n${JSON.stringify(response, null, 2)}`
    );
  } catch (error) {
    await emitLog(
      `Error updating service:\n${JSON.stringify(error, null, 2)}`,
      true,
      'stderr'
    );
  }
}

deployStaging();

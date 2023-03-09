import dotenv from 'dotenv';
dotenv.config();

import { ECSClient, UpdateServiceCommand } from '@aws-sdk/client-ecs';
import { emitLog } from './logging-agent';

const {
  STAGE_ID,
  AWS_REGION,
  AWS_ACCOUNT_ID,
  AWS_ECS_CLUSTER,
  AWS_ECS_SERVICE,
} = process.env;

async function deployProd(): Promise<void> {
  await emitLog(`Deploy to Prod stage starting; stage ID: ${STAGE_ID}`);

  const ecs = new ECSClient({ region: AWS_REGION });

  const serviceArn = `arn:aws:ecs:${AWS_REGION}:${AWS_ACCOUNT_ID}:service/${AWS_ECS_SERVICE}`;
  const clusterArn = `arn:aws:ecs:${AWS_REGION}:${AWS_ACCOUNT_ID}:cluster/${AWS_ECS_CLUSTER}`;

  try {
    // Restart the Fargate service without changing its Task Definition
    // Assumes that the image on ECR hasn't changed and is still tagged ":latest"
    const updateServiceCommand = new UpdateServiceCommand({
      service: serviceArn,
      cluster: clusterArn,
      forceNewDeployment: true,
    });

    await emitLog(`Issuing deploy command: ${updateServiceCommand}`);
    const response = await ecs.send(updateServiceCommand);
    await emitLog(`Service update successful: ${response}`);
  } catch (error) {
    await emitLog(`Error updating service: ${error}`, true, 'stderr');
  }
}

deployProd();

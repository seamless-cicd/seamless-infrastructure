import dotenv from 'dotenv';
dotenv.config();

import { ECSClient, UpdateServiceCommand } from '@aws-sdk/client-ecs';

const ecs = new ECSClient({ region: process.env.AWS_DEFAULT_REGION });

const serviceArn = `arn:aws:ecs:${process.env.AWS_DEFAULT_REGION}:${process.env.AWS_ACCOUNT_ID}:service/${process.env.SERVICE_NAME}`;
const clusterArn = `arn:aws:ecs:${process.env.AWS_DEFAULT_REGION}:${process.env.AWS_ACCOUNT_ID}:cluster/${process.env.CLUSTER_NAME}`;

// Restart the Fargate service without changing its Task Definition
// Assumes that the image on ECR hasn't changed and is still tagged ":latest"
const updateServiceCommand = new UpdateServiceCommand({
  service: serviceArn,
  cluster: clusterArn,
  forceNewDeployment: true,
});

ecs
  .send(updateServiceCommand)
  .then((data) => {
    console.log('Service update successful:', data);
  })
  .catch((error) => {
    console.error('Error updating service:', error);
  });

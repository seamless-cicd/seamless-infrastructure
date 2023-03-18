import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs-extra';
import path from 'path';
import { execaCommand } from 'execa';
import {
  ECRClient,
  GetAuthorizationTokenCommand,
  DescribeRepositoriesCommand,
  CreateRepositoryCommand,
} from '@aws-sdk/client-ecr';
import {
  LogEmitter,
  createLoggedProcess,
  handleProcessError,
} from '@seamless-cicd/execa-logged-process';

const {
  AWS_ACCOUNT_ID,
  AWS_REGION,
  AWS_ECR_REPO,
  STAGE_ID,
  DOCKERFILE_PATH,
  LOG_SUBSCRIBER_URL,
  COMMIT_HASH,
} = process.env;
const WORKING_DIR = `/data/app/${AWS_ECR_REPO}/${COMMIT_HASH}`;

const logger = new LogEmitter(LOG_SUBSCRIBER_URL);

const log = async (message: string) => {
  await logger.emit(message, 'stdout', { stageId: STAGE_ID });
};

const ecrClient = new ECRClient({ region: AWS_REGION });

async function buildAndPushImage(): Promise<void> {
  await log(`Build and push stage starting; stage ID: ${STAGE_ID}`);

  // Verify that source code was cloned
  if (!fs.existsSync(WORKING_DIR)) {
    await log(`Source code hasn't been cloned into ${WORKING_DIR}`);
    process.exit(1);
  }

  // Verify that a Dockerfile exists
  const pathToDockerfile = path.join(
    WORKING_DIR,
    DOCKERFILE_PATH,
    'Dockerfile',
  );
  if (!fs.existsSync(pathToDockerfile)) {
    await log(`Dockerfile not found at ${pathToDockerfile}`);
    process.exit(1);
  }

  // Build Docker image
  try {
    await log(`Building Docker image`);

    const buildProcess = await createLoggedProcess(
      'docker',
      [
        'build',
        '-t',
        `${AWS_ECR_REPO}:${COMMIT_HASH}`,
        '-t',
        `${AWS_ECR_REPO}:latest`,
        path.join(WORKING_DIR, DOCKERFILE_PATH),
      ],
      {},
      LOG_SUBSCRIBER_URL,
      { stageId: STAGE_ID },
    );

    if (buildProcess.exitCode === 0) {
      await log('Build succeeded');
    } else {
      await log('Build failed');
      process.exit(1);
    }
  } catch (error) {
    await handleProcessError(error, LOG_SUBSCRIBER_URL, { stageId: STAGE_ID });
  }

  // Login to ECR
  try {
    await log(`Logging into AWS ECR`);
    const command = new GetAuthorizationTokenCommand({});
    const response = await ecrClient.send(command);

    const authorizationData = response.authorizationData[0];
    const decodedToken = Buffer.from(
      authorizationData.authorizationToken,
      'base64',
    ).toString();
    const [username, password] = decodedToken.split(':');

    const loginAwsProcess = await createLoggedProcess(
      'docker',
      [
        'login',
        '--username',
        username,
        '--password-stdin',
        authorizationData.proxyEndpoint,
      ],
      {
        input: password,
        stdin: 'pipe',
      },
      LOG_SUBSCRIBER_URL,
      { stageId: STAGE_ID },
    );

    if (loginAwsProcess.exitCode === 0) {
      await log('Login succeeded');
    } else {
      await log('Login failed');
      process.exit(1);
    }
  } catch (error) {
    await handleProcessError(error, LOG_SUBSCRIBER_URL, { stageId: STAGE_ID });
  }

  // Check if ECR repository exists
  try {
    await log(`Checking if ${AWS_ECR_REPO} exists in ECR`);
    const describeCommand = new DescribeRepositoriesCommand({
      repositoryNames: [AWS_ECR_REPO],
    });

    // This throws an error if the repo doesn't exist
    await ecrClient.send(describeCommand);
    await log(`It exists in ECR`);
  } catch (error) {
    if (error.name === 'RepositoryNotFoundException') {
      await log(`${AWS_ECR_REPO} does not exist in ECR; creating now`);
      const createCommand = new CreateRepositoryCommand({
        repositoryName: AWS_ECR_REPO,
      });

      await ecrClient.send(createCommand);
      console.log(`ECR repository ${AWS_ECR_REPO} created`);
    } else {
      await logger.emit(
        `Error checking for ECR repository ${AWS_ECR_REPO}`,
        'stderr',
        { stageId: STAGE_ID },
      );
      process.exit(1);
    }
  }

  // Tag image
  const fullEcrTag = `${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${AWS_ECR_REPO}:${COMMIT_HASH}`;

  try {
    await execaCommand(
      `docker tag ${AWS_ECR_REPO}:${COMMIT_HASH} ${fullEcrTag}`,
    );
  } catch (error) {
    await logger.emit(`Error tagging image ${fullEcrTag}`, 'stderr', {
      stageId: STAGE_ID,
    });
    process.exit(1);
  }

  // Push image
  try {
    await log(`Pushing image ${AWS_ECR_REPO} to ECR`);

    const pushToEcrProcess = await createLoggedProcess(
      'docker',
      ['push', fullEcrTag],
      {},
      LOG_SUBSCRIBER_URL,
      { stageId: STAGE_ID },
    );

    if (pushToEcrProcess.exitCode === 0) {
      await log('Push succeeded');
    } else {
      await logger.emit('Push failed', 'stderr', {
        stageId: STAGE_ID,
      });
      process.exit(1);
    }
  } catch (error) {
    await handleProcessError(error, LOG_SUBSCRIBER_URL, { stageId: STAGE_ID });
  }
}

buildAndPushImage();

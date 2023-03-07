import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import path from 'path';
import { execaCommand } from 'execa';
import {
  ECRClient,
  GetAuthorizationTokenCommand,
  DescribeRepositoriesCommand,
  CreateRepositoryCommand,
} from '@aws-sdk/client-ecr';
// Import TS file using `.js` extension (https://stackoverflow.com/a/75583110)
import { emitLog } from './logging-agent.js';
import {
  createLoggedProcess,
  handleProcessError,
} from './child-process-with-logging.js';

const { STAGE_ID, DOCKERFILE_PATH, AWS_ECR_REPO, AWS_REGION, AWS_ACCOUNT_ID } =
  process.env;
const DIR_TO_CLONE_INTO = '/data/app';

const ecrClient = new ECRClient({ region: AWS_REGION });

async function buildAndPushImage(): Promise<void> {
  await emitLog(`Build and push stage starting; stage ID: ${STAGE_ID}`);

  // Verify that source code was cloned
  if (!fs.existsSync(DIR_TO_CLONE_INTO)) {
    await emitLog(`Source code hasn't been cloned into ${DIR_TO_CLONE_INTO}`);
    process.exit(1);
  }

  // Verify that a Dockerfile exists
  const pathToDockerfile = path.join(
    DIR_TO_CLONE_INTO,
    DOCKERFILE_PATH,
    'Dockerfile',
  );
  if (!fs.existsSync(pathToDockerfile)) {
    await emitLog(`Dockerfile not found at ${pathToDockerfile}`);
    process.exit(1);
  }

  // Build Docker image
  try {
    await emitLog(`Building Docker image`);

    const buildProcess = await createLoggedProcess('docker', [
      'build',
      '-t',
      AWS_ECR_REPO,
      path.join(DIR_TO_CLONE_INTO, DOCKERFILE_PATH),
    ]);

    if (buildProcess.exitCode === 0) {
      await emitLog('Build succeeded');
    } else {
      await emitLog('Build failed');
      process.exit(1);
    }
  } catch (error) {
    await handleProcessError(error);
  }

  // Login to AWS
  try {
    await emitLog(`Logging into AWS ECR`);
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
    );

    if (loginAwsProcess.exitCode === 0) {
      await emitLog('Login succeeded');
    } else {
      await emitLog('Login failed');
      process.exit(1);
    }
  } catch (error) {
    await handleProcessError(error);
  }

  // Check if ECR repository exists
  try {
    await emitLog(`Checking if ${AWS_ECR_REPO} exists in ECR`);
    const describeCommand = new DescribeRepositoriesCommand({
      repositoryNames: [AWS_ECR_REPO],
    });

    await ecrClient.send(describeCommand);
    await emitLog(`It exists in ECR`);
  } catch (error) {
    if (error.name === 'RepositoryNotFoundException') {
      await emitLog(`${AWS_ECR_REPO} does not exist in ECR; creating now`);
      const createCommand = new CreateRepositoryCommand({
        repositoryName: AWS_ECR_REPO,
      });

      await ecrClient.send(createCommand);
      console.log(`ECR repository ${AWS_ECR_REPO} created`);
    } else {
      console.error(`Error checking for ECR repository ${AWS_ECR_REPO}`);
      process.exit(1);
    }
  }

  // Tag image
  const fullEcrTag = `${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${AWS_ECR_REPO}:latest`;
  await execaCommand(`docker tag ${AWS_ECR_REPO}:latest ${fullEcrTag}`);

  // Push image
  await emitLog(`Pushing image ${AWS_ECR_REPO} to ECR`);

  try {
    const pushToEcrProcess = await createLoggedProcess('docker', [
      'push',
      fullEcrTag,
    ]);

    if (pushToEcrProcess.exitCode === 0) {
      await emitLog('Push succeeded');
    } else {
      await emitLog('Push failed');
      process.exit(1);
    }
  } catch (error) {
    await handleProcessError(error);
  }
}

buildAndPushImage();

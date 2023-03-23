import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs-extra';
import path from 'path';
import YAML from 'yaml';
import { ECRClient, GetAuthorizationTokenCommand } from '@aws-sdk/client-ecr';
import {
  LogEmitter,
  createLoggedProcess,
  handleProcessError,
} from '@seamless-cicd/execa-logged-process';

const {
  STAGE_ID,
  AWS_ACCOUNT_ID,
  AWS_REGION,
  GITHUB_OAUTH_TOKEN,
  GITHUB_REPO_URL,
  COMMIT_HASH,
  GITHUB_INTEGRATION_TEST_REPO_URL,
  DOCKER_COMPOSE_FILE_PATH,
  DOCKER_COMPOSE_SERVICE_NAME,
  DOCKER_COMPOSE_INTEGRATION_TEST_SERVICE_NAME,
  LOG_SUBSCRIBER_URL,
} = process.env;

// Service being tested; should have been built/pushed to ECR in the Build stage
const repoPath = GITHUB_REPO_URL.match(/\/([^/]+\/[^/.]+)(?:\.git)?$/)?.[1];
const integrationTestRepoPath = GITHUB_INTEGRATION_TEST_REPO_URL.match(
  /\/([^/]+\/[^/.]+)(?:\.git)?$/,
)?.[1];
const INTEGRATION_TEST_WORKING_DIR = `/data/app/${integrationTestRepoPath}`;

const logger = new LogEmitter(LOG_SUBSCRIBER_URL);

const log = async (message: string) => {
  await logger.emit(message, 'stdout', { stageId: STAGE_ID });
};

const ecrClient = new ECRClient({ region: AWS_REGION });

async function runIntegrationTests(): Promise<void> {
  await log(`Integration test stage starting; stage ID: ${STAGE_ID}`);

  // Clone and build integration tester image
  try {
    await log(`Cloning integration test source code`);

    await fs.rmdirSync(INTEGRATION_TEST_WORKING_DIR, { recursive: true });

    const cloneProcess = await createLoggedProcess(
      'git',
      [
        'clone',
        '--depth',
        '1',
        `https://${GITHUB_OAUTH_TOKEN}@github.com/${integrationTestRepoPath}.git`,
        INTEGRATION_TEST_WORKING_DIR,
      ],
      {},
      LOG_SUBSCRIBER_URL,
      { stageId: STAGE_ID },
    );

    if (cloneProcess.exitCode === 0) {
      await log('Cloning succeeded');
    } else {
      await log('Cloning failed');
      process.exit(1);
    }

    // Build Docker image for integration tester (local only; do not push to ECR)
    // Assume Dockerfile is located in root of integration test repo
    await log(`Building Docker image for integration test service`);

    const buildProcess = await createLoggedProcess(
      'docker',
      [
        'build',
        '-t',
        integrationTestRepoPath,
        path.join(INTEGRATION_TEST_WORKING_DIR),
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

  // Determine path for Docker image created in the Build stage
  const fullEcrRepo = `${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${repoPath}`;
  const fullEcrTag = `${fullEcrRepo}:${COMMIT_HASH}`;

  // Update Docker Compose file with latest images
  process.chdir(INTEGRATION_TEST_WORKING_DIR);

  const dockerComposeFile = YAML.parse(
    fs.readFileSync(
      path.join(
        INTEGRATION_TEST_WORKING_DIR,
        DOCKER_COMPOSE_FILE_PATH,
        'docker-compose.yml',
      ),
      'utf8',
    ),
  );

  dockerComposeFile.services[DOCKER_COMPOSE_SERVICE_NAME].image = fullEcrTag;
  dockerComposeFile.services[
    DOCKER_COMPOSE_INTEGRATION_TEST_SERVICE_NAME
  ].image = `${integrationTestRepoPath}:latest`;

  fs.writeFileSync(
    path.join(INTEGRATION_TEST_WORKING_DIR, 'docker-compose.yml'),
    YAML.stringify(dockerComposeFile),
  );

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

  // Execute Docker Compose file to run integration tests
  try {
    await log(`Running integration tests`);
    const integrationTestProcess = await createLoggedProcess(
      'docker',
      [
        'compose',
        'up',
        '--exit-code-from',
        DOCKER_COMPOSE_INTEGRATION_TEST_SERVICE_NAME,
      ],
      {},
      LOG_SUBSCRIBER_URL,
      { stageId: STAGE_ID },
    );

    if (integrationTestProcess.exitCode === 0) {
      await log('Integration tests passed');
    } else {
      await log('Integration tests failed');
      process.exit(1);
    }
  } catch (error) {
    await handleProcessError(error, LOG_SUBSCRIBER_URL, { stageId: STAGE_ID });
  }
}

runIntegrationTests();

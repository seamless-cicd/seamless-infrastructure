import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs-extra';
import {
  LogEmitter,
  createLoggedProcess,
  handleProcessError,
} from '@seamless-cicd/execa-logged-process';

const {
  STAGE_ID,
  GITHUB_REPO_URL,
  COMMIT_HASH,
  UNIT_TEST_COMMAND,
  LOG_SUBSCRIBER_URL,
} = process.env;

const repoPath = GITHUB_REPO_URL.match(/\/([^/]+\/[^/.]+)(?:\.git)?$/)?.[1];
const WORKING_DIR = `/data/app/${repoPath}/${COMMIT_HASH}`;

const logger = new LogEmitter(LOG_SUBSCRIBER_URL);

// Logger wrapper that sends along stage ID
const log = async (message: string) => {
  await logger.emit(message, 'stdout', { stageId: STAGE_ID });
};

async function runUnitTests(): Promise<void> {
  await log(`Unit test stage starting; stage ID: ${STAGE_ID}`);

  // Verify that source code was cloned
  if (!fs.existsSync(WORKING_DIR)) {
    await log(`Source code hasn't been cloned into ${WORKING_DIR}`);
    process.exit(1);
  }

  // Run unit test command
  try {
    await log(`Running unit test command:  ${UNIT_TEST_COMMAND}`);
    process.chdir(WORKING_DIR);

    const codeQualityProcess = await createLoggedProcess(
      UNIT_TEST_COMMAND.split(' ')[0],
      UNIT_TEST_COMMAND.split(' ').slice(1),
      {},
      LOG_SUBSCRIBER_URL,
      { stageId: STAGE_ID },
    );

    if (codeQualityProcess.exitCode === 0) {
      await log('Unit tests passed');
    } else {
      await log('Unit tests failed');
    }
  } catch (error) {
    await handleProcessError(error, LOG_SUBSCRIBER_URL, { stageId: STAGE_ID });
  }
}

runUnitTests();

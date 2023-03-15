import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs-extra';
import {
  LogEmitter,
  createLoggedProcess,
  handleProcessError,
} from '@seamless-cicd/execa-logged-process';

const { STAGE_ID, UNIT_TEST_COMMAND, LOG_SUBSCRIBER_URL } = process.env;
const DIR_TO_CLONE_INTO = '/data/app';

const logger = new LogEmitter(LOG_SUBSCRIBER_URL);

// Logger wrapper that sends along stage ID
const log = async (message: string) => {
  await logger.emit(message, 'stdout', { stageId: STAGE_ID });
};

async function runUnitTests(): Promise<void> {
  await log(`Unit test stage starting; stage ID: ${STAGE_ID}`);

  // Verify that source code was cloned
  if (!fs.existsSync(DIR_TO_CLONE_INTO)) {
    await log(`Source code hasn't been cloned into ${DIR_TO_CLONE_INTO}`);
    process.exit(1);
  }

  // Run unit test command
  try {
    await log(`Running unit test command:  ${UNIT_TEST_COMMAND}`);
    process.chdir(DIR_TO_CLONE_INTO);

    const codeQualityProcess = await createLoggedProcess(
      UNIT_TEST_COMMAND.split(' ')[0],
      UNIT_TEST_COMMAND.split(' ').slice(1),
      {},
      LOG_SUBSCRIBER_URL,
      { stageId: STAGE_ID },
    );

    if (codeQualityProcess.exitCode === 0) {
      await log('Unit test check succeeded');
    } else {
      await log('Unit test check failed');
    }
  } catch (error) {
    await handleProcessError(error, LOG_SUBSCRIBER_URL, { stageId: STAGE_ID });
  }
}

runUnitTests();

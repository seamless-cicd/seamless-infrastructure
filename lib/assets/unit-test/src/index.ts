import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
// Import TS file using `.js` extension (https://stackoverflow.com/a/75583110)
import { emitLog } from './logging-agent.js';
import {
  createLoggedProcess,
  handleProcessError,
} from './child-process-with-logging.js';

const { STAGE_ID, UNIT_TEST_COMMAND } = process.env;
const DIR_TO_CLONE_INTO = '/data/app';

async function runUnitTests(): Promise<void> {
  await emitLog(`Unit test stage starting; stage ID: ${STAGE_ID}`);

  // Verify that source code was cloned
  if (!fs.existsSync(DIR_TO_CLONE_INTO)) {
    await emitLog(`Source code hasn't been cloned into ${DIR_TO_CLONE_INTO}`);
    process.exit(1);
  }

  // Run unit test command
  try {
    await emitLog(`Running unit test command:  ${UNIT_TEST_COMMAND}`);
    process.chdir(DIR_TO_CLONE_INTO);

    const codeQualityProcess = await createLoggedProcess(
      UNIT_TEST_COMMAND.split(' ')[0],
      UNIT_TEST_COMMAND.split(' ').slice(1),
    );

    if (codeQualityProcess.exitCode === 0) {
      await emitLog('Unit test check succeeded');
    } else {
      await emitLog('Unit test check failed');
    }
  } catch (error) {
    await handleProcessError(error);
  }
}

runUnitTests();

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs-extra';
import {
  LogEmitter,
  createLoggedProcess,
  handleProcessError,
} from '@seamless-cicd/execa-logged-process';

const { STAGE_ID, CODE_QUALITY_COMMAND, LOG_SUBSCRIBER_URL } = process.env;
const DIR_TO_CLONE_INTO = '/data/app';

const logger = new LogEmitter(LOG_SUBSCRIBER_URL);

// Logger wrapper that sends along stage ID
const log = async (message: string) => {
  await logger.emit(message, 'stdout', { stageId: STAGE_ID });
};

async function checkCodeQuality(): Promise<void> {
  await log(`Code quality stage starting; stage ID: ${STAGE_ID}`);

  // Verify that source code was cloned
  if (!fs.existsSync(DIR_TO_CLONE_INTO)) {
    await log(`Source code hasn't been cloned into ${DIR_TO_CLONE_INTO}`);
    process.exit(1);
  }

  // Run code quality command
  try {
    await log(`Running code quality command:  ${CODE_QUALITY_COMMAND}`);
    process.chdir(DIR_TO_CLONE_INTO);

    const codeQualityProcess = await createLoggedProcess(
      CODE_QUALITY_COMMAND.split(' ')[0],
      CODE_QUALITY_COMMAND.split(' ').slice(1),
      {},
      LOG_SUBSCRIBER_URL,
      { stageId: STAGE_ID },
    );

    if (codeQualityProcess.exitCode === 0) {
      await log('Code quality check succeeded');
    } else {
      await log('Code quality check failed');
    }
  } catch (error) {
    await handleProcessError(error, LOG_SUBSCRIBER_URL);
  }
}

checkCodeQuality();

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs-extra';
import { execaCommand } from 'execa';
import {
  LogEmitter,
  createLoggedProcess,
  handleProcessError,
} from '@seamless-cicd/execa-logged-process';

const { GITHUB_PAT, GITHUB_REPO_URL, STAGE_ID, LOG_SUBSCRIBER_URL } =
  process.env;
const DIR_TO_CLONE_INTO = '/data/app';

const logger = new LogEmitter(LOG_SUBSCRIBER_URL);

async function cloneRepo(): Promise<void> {
  await logger.emit(`Cloning stage starting; stage ID: ${STAGE_ID}`);

  // Remove any existing source code
  if (fs.existsSync(DIR_TO_CLONE_INTO)) {
    await logger.emit(
      `Removing existing source code from ${DIR_TO_CLONE_INTO}`,
    );
    await fs.emptyDir(DIR_TO_CLONE_INTO);
  }

  // Clone the repository
  try {
    await logger.emit(`Cloning source code from ${GITHUB_REPO_URL}`);

    // GitHub classic PAT can be spliced into the repo URL for authentication
    const cloneProcess = await createLoggedProcess(
      'git',
      [
        'clone',
        `https://${GITHUB_PAT}@${GITHUB_REPO_URL.split('://')[1]}.git`,
        DIR_TO_CLONE_INTO,
      ],
      {},
      LOG_SUBSCRIBER_URL,
    );

    if (cloneProcess.exitCode === 0) {
      await logger.emit('Cloning succeeded');
    } else {
      await logger.emit('Cloning failed');
      // End process here because dependency installation won't work
      process.exit(1);
    }
  } catch (error) {
    await handleProcessError(error, LOG_SUBSCRIBER_URL);
  }

  // Install dependencies
  try {
    await logger.emit('Installing dependencies');
    process.chdir(DIR_TO_CLONE_INTO);

    const installProcess = await createLoggedProcess(
      'npm',
      ['ci'],
      {},
      LOG_SUBSCRIBER_URL,
    );

    if (installProcess.exitCode === 0) {
      await logger.emit('Dependencies installed');
    } else {
      await logger.emit('Failed to install dependencies; deleting cloned code');
      await fs.emptyDir(DIR_TO_CLONE_INTO);
      process.exit(1);
    }
  } catch (error) {
    await handleProcessError(error, LOG_SUBSCRIBER_URL);
  }
}

cloneRepo();

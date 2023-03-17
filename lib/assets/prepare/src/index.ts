import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs-extra';
import {
  LogEmitter,
  createLoggedProcess,
  handleProcessError,
} from '@seamless-cicd/execa-logged-process';

const {
  GITHUB_PAT,
  GITHUB_REPO_URL,
  STAGE_ID,
  LOG_SUBSCRIBER_URL,
  COMMIT_HASH,
  AWS_ECR_REPO,
} = process.env;
const DIR_TO_CLONE_INTO = `/data/app/${AWS_ECR_REPO}/${COMMIT_HASH}`;

const logger = new LogEmitter(LOG_SUBSCRIBER_URL);

// Logger wrapper that sends along stage ID
const log = async (message: string) => {
  await logger.emit(message, 'stdout', { stageId: STAGE_ID });
};

async function cloneRepo(): Promise<void> {
  await log(`Cloning stage starting; stage ID: ${STAGE_ID}`);

  // Remove any existing source code
  if (fs.existsSync(DIR_TO_CLONE_INTO)) {
    await log(`Removing existing source code from ${DIR_TO_CLONE_INTO}`);
    await fs.emptyDir(DIR_TO_CLONE_INTO);
  }

  // Shallow clone the repository
  try {
    await log(`Cloning source code from ${GITHUB_REPO_URL}`);

    // GitHub classic PAT can be spliced into the repo URL for authentication
    const cloneProcess = await createLoggedProcess(
      'git',
      [
        'clone',
        '--depth',
        '1',
        `https://${GITHUB_PAT}@${GITHUB_REPO_URL.split('://')[1]}.git`,
        DIR_TO_CLONE_INTO,
      ],
      {},
      LOG_SUBSCRIBER_URL,
      { stageId: STAGE_ID },
    );

    if (cloneProcess.exitCode === 0) {
      await log('Cloning succeeded');
    } else {
      await log('Cloning failed');
      // End process here because dependency installation won't work
      process.exit(1);
    }
  } catch (error) {
    await handleProcessError(error, LOG_SUBSCRIBER_URL, { stageId: STAGE_ID });
  }

  // Install dependencies
  try {
    await log('Installing dependencies');
    process.chdir(DIR_TO_CLONE_INTO);

    const installProcess = await createLoggedProcess(
      'npm',
      ['ci'],
      {},
      LOG_SUBSCRIBER_URL,
      { stageId: STAGE_ID },
    );

    if (installProcess.exitCode === 0) {
      await log('Dependencies installed');
    } else {
      await log('Failed to install dependencies; deleting cloned code');
      await fs.emptyDir(DIR_TO_CLONE_INTO);
      process.exit(1);
    }
  } catch (error) {
    await handleProcessError(error, LOG_SUBSCRIBER_URL, { stageId: STAGE_ID });
  }
}

cloneRepo();

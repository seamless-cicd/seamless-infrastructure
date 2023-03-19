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
  GITHUB_OAUTH_TOKEN,
  GITHUB_REPO_URL,
  COMMIT_HASH,
  LOG_SUBSCRIBER_URL,
} = process.env;

// Extract owner and repo. Removes trailing ".git" if included
// "https://github.com/owner/repo.git" becomes "owner/repo"
const repoPath = GITHUB_REPO_URL.match(/\/([^/]+\/[^/.]+)(?:\.git)?$/)?.[1];
const WORKING_DIR = `/data/app/${repoPath}/${COMMIT_HASH}`;

const logger = new LogEmitter(LOG_SUBSCRIBER_URL);

// Logger wrapper that sends along stage ID
const log = async (message: string) => {
  await logger.emit(message, 'stdout', { stageId: STAGE_ID });
};

async function cloneRepo(): Promise<void> {
  await log(`Cloning stage starting; stage ID: ${STAGE_ID}`);

  // Remove any existing source code
  if (fs.existsSync(WORKING_DIR)) {
    await log(`Removing existing source code from ${WORKING_DIR}`);
    await fs.emptyDir(WORKING_DIR);
  }

  // Clone the repository
  try {
    await log(
      `Cloning source code from ${GITHUB_REPO_URL}, commit ${COMMIT_HASH}`,
    );

    // Splice OAuth token into the repo URL for authentication
    const cloneProcess = await createLoggedProcess(
      'git',
      [
        'clone',
        `https://${GITHUB_OAUTH_TOKEN}@github.com/${repoPath}.git`,
        WORKING_DIR,
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

    // Checkout the specified commit hash
    await log(`Checking out commit ${COMMIT_HASH}`);

    process.chdir(WORKING_DIR);
    const checkoutProcess = await createLoggedProcess(
      'git',
      ['checkout', COMMIT_HASH],
      {},
      LOG_SUBSCRIBER_URL,
      { stageId: STAGE_ID },
    );

    if (checkoutProcess.exitCode === 0) {
      await log('Checkout succeeded');
    } else {
      await log('Checkout failed');
      process.exit(1);
    }
  } catch (error) {
    await handleProcessError(error, LOG_SUBSCRIBER_URL, { stageId: STAGE_ID });
  }

  // Install all dependencies, including dev dependencies to be used for testing
  try {
    await log('Installing dependencies');

    const installProcess = await createLoggedProcess(
      'npm',
      ['install'],
      {},
      LOG_SUBSCRIBER_URL,
      { stageId: STAGE_ID },
    );

    if (installProcess.exitCode === 0) {
      await log('Dependencies installed');
    } else {
      await log('Failed to install dependencies; deleting cloned code');
      await fs.emptyDir(WORKING_DIR);
      process.exit(1);
    }
  } catch (error) {
    await handleProcessError(error, LOG_SUBSCRIBER_URL, { stageId: STAGE_ID });
  }
}

cloneRepo();

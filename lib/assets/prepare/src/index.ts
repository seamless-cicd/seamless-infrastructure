import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import { execaCommand } from 'execa';
// Import TS file using `.js` extension (https://stackoverflow.com/a/75583110)
import { emitLog } from './logging-agent.js';
import {
  createLoggedProcess,
  handleProcessError,
} from './child-process-with-logging.js';

const { GITHUB_PAT, GITHUB_REPO_URL, STAGE_ID } = process.env;
const DIR_TO_CLONE_INTO = '/data/app';

async function cloneRepo(): Promise<void> {
  await emitLog(`Cloning stage starting; stage ID: ${STAGE_ID}`);

  // Remove any existing source code
  if (fs.existsSync(DIR_TO_CLONE_INTO)) {
    await emitLog(`Removing existing directory ${DIR_TO_CLONE_INTO}`);
    fs.rmSync(DIR_TO_CLONE_INTO, { recursive: true, force: true });
  }

  // Clone the repository
  try {
    await emitLog(`Cloning source code from ${GITHUB_REPO_URL}`);

    // GitHub classic PAT can be spliced into the repo URL for authentication
    const cloneProcess = await createLoggedProcess('git', [
      'clone',
      `https://${GITHUB_PAT}@${GITHUB_REPO_URL.split('://')[1]}.git`,
      DIR_TO_CLONE_INTO,
    ]);

    if (cloneProcess.exitCode === 0) {
      await emitLog('Cloning succeeded');
    } else {
      await emitLog('Cloning failed');
      // End process here because dependency installation won't work
      process.exit(1);
    }
  } catch (error) {
    await handleProcessError(error);
  }

  // Install dependencies
  try {
    await emitLog('Installing dependencies');
    process.chdir(DIR_TO_CLONE_INTO);
    await execaCommand('npm config set fetch-retry-mintimeout 20000');
    await execaCommand('npm config set fetch-retry-maxtimeout 120000');

    const installProcess = await createLoggedProcess('npm', ['ci']);

    if (installProcess.exitCode === 0) {
      await emitLog('Dependencies installed');
    } else {
      await emitLog('Failed to install dependencies; deleting cloned code');
      fs.rmSync(DIR_TO_CLONE_INTO, { recursive: true, force: true });
      process.exit(1);
    }
  } catch (error) {
    await handleProcessError(error);
  }
}

cloneRepo();

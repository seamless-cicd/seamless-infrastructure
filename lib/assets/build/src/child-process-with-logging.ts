import { execa, Options, ExecaError } from 'execa';
// Import TS file using `.js` extension (https://stackoverflow.com/a/75583110)
import { emitLog } from './logging-agent.js';

const defaultOptions: Options = {
  stdin: 'inherit',
  stdout: 'pipe',
  stderr: 'pipe',
};

// Create a child process whose stdout and stderr are sent to a logging agent
async function createLoggedProcess(
  execaFile: string,
  execaArgs: string[],
  userSpecifiedOptions: Options = defaultOptions,
) {
  const childProcess = execa(execaFile, execaArgs, {
    ...defaultOptions,
    ...userSpecifiedOptions,
  });

  const { stdout, stderr } = childProcess;

  stdout?.on('data', (data: Buffer) => {
    emitLog(data.toString(), true, 'stdout');
  });

  stderr?.on('data', (data: Buffer) => {
    emitLog(data.toString(), true, 'stderr');
  });

  return childProcess;
}

// Emits final error logs and shuts down the process
async function handleProcessError(error: ExecaError, logToConsole = true) {
  await emitLog(error.shortMessage);
  await emitLog('Error occurred');

  // Optionally log to console, for debugging
  if (logToConsole) {
    console.error(error);
  }

  process.exit(error.exitCode || 1);
}

export { createLoggedProcess, handleProcessError };

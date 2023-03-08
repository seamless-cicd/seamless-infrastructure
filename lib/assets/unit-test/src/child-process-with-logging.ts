import { execa, Options, ExecaError } from 'execa';
// Import TS file using `.js` extension (https://stackoverflow.com/a/75583110)
import { emitLog } from './logging-agent.js';

const execaOptions: Options = {
  stdin: 'inherit',
  stdout: 'pipe',
  stderr: 'pipe',
};

// Create a child process whose stdout and stderr are sent to a logging agent
async function createLoggedProcess(execaFile: string, execaArgs: string[]) {
  const childProcess = execa(execaFile, execaArgs, execaOptions);

  const { stdout, stderr } = childProcess;

  stdout.on('data', (data: Buffer) => {
    emitLog(data.toString());
  });

  stderr.on('data', (data: Buffer) => {
    emitLog(data.toString());
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

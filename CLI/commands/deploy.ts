import init from './init';
import { exec } from 'child_process';
import chalk from 'chalk'

const CDK_DEPLOY = 'npm install';
const arrow = '\u2192';

const deploy = () => {
  init();

  exec(CDK_DEPLOY, (err: any, stdout: any, stderr: any) => {
    if (err) {
      console.error(err);
      console.error(`stderr: ${stderr}`);
      return;
    }

    console.log(chalk.bold.blue(`${arrow} Seamless Deploy:`), 'with AWS CDK', `${stdout}`);
    console.log(chalk.bold(`${chalk.green("✔️")}`), chalk.bold.blue(`Seamless Deploy:`), 'complete');
  });

};

export default deploy;
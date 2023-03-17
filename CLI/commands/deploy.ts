import init from './init.js';
import { exec } from 'child_process';
import chalk from 'chalk'

const CDK_DEPLOY = 'cdk deploy';
const arrow = '\u2192';

const deploy = () => {
  init();

  exec(CDK_DEPLOY, (err, stdout, stderr) => {
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
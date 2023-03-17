import fs from 'fs';
import chalk from 'chalk';
import readlineSync from 'readline-sync';

const arrow = '\u2192';

const init = () => {
  console.log(chalk.bold.blue(`${arrow} Seamless Init:`), '.env file');

  const question1 = `${chalk.bold('Enter Variable 1: ')}`;
  const question2 = `${chalk.bold('Enter Variable 2: ')}`;

  const variableOne = readlineSync.question(question1);
  const variableTwo = readlineSync.question(question2);

  type Variables = {
    [key: string]: string;
  }

  // sample vars - to be replaced once decided
  const envVars: Variables = {
    VARIABLE_ONE: variableOne,
    VARIABLE_TWO: variableTwo,
  }

  const envContents = Object.keys(envVars)
    .map(key => `${key}=${envVars[key]}`)
    .join('\n');

  fs.writeFileSync('../.env', envContents);
  console.log(chalk.bold(`${chalk.green("✔️")}`), chalk.bold.blue(`Seamless Init:`), 'complete');
};

export default init;
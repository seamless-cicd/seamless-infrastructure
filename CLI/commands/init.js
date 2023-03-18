import fs from 'fs';
import chalk from 'chalk';
import readlineSync from 'readline-sync';
import logo from '../logo.js';

const question = (text) => {
  const boldText = `${chalk.bold(`${text}: `)}`;
  return readlineSync.question(boldText);
}

const arrowText = (text1, text2, text3='') => {
  const arrow = '\u2192';
  console.log(chalk.bold.blue(`${arrow} ${text1}`), `${text2}`, `${text3}`);
}

const checkmarkText = (text1, text2) => {
  console.log(chalk.bold(`${chalk.green("✔️")}`), chalk.bold.blue(text1), text2);
}

const getEnvVariables = () => {
  const awsAccountId = question('AWS Account ID');
  const awsAccessKey = question('AWS Access Key');
  const awsSecretAccessKey = question('AWS Secret Access Key');
  const githubClientSecret = question('GitHub Client Secret');
  const snsSubscriberUrl = question('SNS Subscriber URL');

  const envVariables = {
    AWS_ACCOUNT_ID: awsAccountId,
    AWS_ACCESS_KEY: awsAccessKey,
    AWS_SECRET_ACCESS_KEY: awsSecretAccessKey,
    GITHUB_CLIENT_SECRET: githubClientSecret,
    SNS_SUBSCRIBER_URL: snsSubscriberUrl,
  }

  const envContents = Object.keys(envVariables)
    .map(key => `${key}=${envVariables[key]}`)
    .join('\n');

  return envContents;
}

const init = () => {
  console.log(logo);
  arrowText('Seamless Init:', '.env file');

  const envContents = getEnvVariables();
  fs.writeFileSync('.env', envContents);

  checkmarkText('Seamless Init:', 'complete');
};

export { init, arrowText, checkmarkText };
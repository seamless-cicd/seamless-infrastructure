const chalk = require('chalk');
const { exec } = require('child_process');
const fs = require('fs');
const readlineSync = require('readline-sync');
const { logo, arrowText, checkmarkText } = require('../utils.js');
const z = require('zod');

const CDK_BOOTSTRAP = 'cdk bootstrap';

const question = (text) => {
  const boldText = `${chalk.bold(`${text}: `)}`;
  const answer = readlineSync.question(boldText);
  return answer;
};

const envSchema = z.object({
  AWS_ACCOUNT_ID: z.string(),
  AWS_REGION: z.string(),
  GITHUB_CLIENT_ID: z.string(),
  GITHUB_CLIENT_SECRET: z.string(),
  SNS_SUBSCRIBER_URL: z.string().url().optional(),
  EMAIL_ADDRESS: z.string().email().optional(),
  SLACK_WEBHOOK_URL: z.string().url().optional(),
});

const getEnvVariables = () => {
  const awsAccountId = question('AWS Account ID');
  const awsRegion = question('AWS Region');
  const githubClientId = question('GitHub Client Id');
  const githubClientSecret = question('GitHub Client Secret');
  const snsSubscriberUrl = question('SNS Subscriber URL (Optional)');
  const emailAddress = question('Email Address (Optional)');
  const slackWebhookUrl = question('Slack Webhook URL (Optional)');

  const envVariables = {
    AWS_ACCOUNT_ID: awsAccountId,
    AWS_REGION: awsRegion,
    GITHUB_CLIENT_ID: githubClientId,
    GITHUB_CLIENT_SECRET: githubClientSecret,
  };

  if (snsSubscriberUrl) {
    envVariables.SNS_SUBSCRIBER_URL = snsSubscriberUrl;
  }

  if (emailAddress) {
    envVariables.EMAIL_ADDRESS = emailAddress;
  }

  if (slackWebhookUrl) {
    envVariables.SLACK_WEBHOOK_URL = slackWebhookUrl;
  }

  return envVariables;
};

const validEnvironment = (envVariables) => {
  const dimmedText = `${chalk.dim('\nValidating Input...')}`;
  console.log(dimmedText);

  const parsedEnv = envSchema.safeParse(envVariables);

  if (!parsedEnv.success) {
    const errorMessage = chalk.bold.red(parsedEnv.error);
    console.log(errorMessage);
    return false;
  }

  return true;
};

const bootstrap = () => {
  exec(CDK_BOOTSTRAP, (err, stdout, stderr) => {
    if (err) {
      console.error(err);
      console.error(`stderr: ${stderr}`);
      return;
    }

    arrowText('Bootstrapping Seamless:', 'with AWS CDK', `${stdout}`);
  });
};

const init = () => {
  console.log(logo);

  arrowText('Initializing Seamless', 'Set up your CI/CD pipeline!');

  while (true) {
    const envVariables = getEnvVariables();

    if (validEnvironment(envVariables)) {
      const envContents = Object.keys(envVariables)
        .filter((key) => envVariables[key])
        .map((key) => `${key}=${envVariables[key]}`)
        .join('\n');

      fs.writeFileSync('.env', envContents);
      break;
    }
  }

  bootstrap();
  checkmarkText('Seamless Init:', 'complete');
};

module.exports = { init };

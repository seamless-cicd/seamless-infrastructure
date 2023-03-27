const fs = require('fs');
const readlineSync = require('readline-sync');
const { logo, arrowText, checkmarkText } = require('../utils.js');
const z = require('zod');

const question = async (text) => {
  const { chalk } = await require('../esmodules.js')();

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

const getEnvVariables = async () => {
  const awsAccountId = await question('AWS Account ID');
  const awsRegion = await question('AWS Region');
  const githubClientId = await question('GitHub Client Id');
  const githubClientSecret = await question('GitHub Client Secret');
  const snsSubscriberUrl = await question('SNS Subscriber URL (Optional)');
  const emailAddress = await question('Email Address (Optional)');
  const slackWebhookUrl = await question('Slack Webhook URL (Optional)');

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

const validEnvironment = async (envVariables) => {
  const { chalk } = await require('../esmodules.js')();
  const dimmedText = `${chalk.dim('\nValidating Input...')}`;
  console.log(dimmedText);

  const parsedEnv = envSchema.safeParse(envVariables);

  if (!parsedEnv.success) {
    const errorMessage = chalk.bold.red(parsedEnv.error);
    console.log(errorMessage);
    return false;
  }

  const boldText = `${chalk.bold('Ready to boostrap! ✅')}`;
  console.log(boldText);

  return true;
};

const bootstrap = async () => {
  const { execa } = await require('../esmodules.js')();

  arrowText('Bootstrapping Seamless:', 'with AWS CDK');

  const childprocess = execa('cdk', ['bootstrap']).pipeStdout(process.stdout);

  await childprocess;
};

const init = async () => {
  const { chalk } = await require('../esmodules.js')();

  console.log(chalk.bold.blue('Welcome to the Seamless CLI!'));
  console.log(logo);

  arrowText('Initializing Seamless', 'Set up your CI/CD pipeline!');

  while (true) {
    const envVariables = await getEnvVariables();

    if (validEnvironment(envVariables)) {
      const envContents = Object.keys(envVariables)
        .filter((key) => envVariables[key])
        .map((key) => `${key}=${envVariables[key]}`)
        .join('\n');

      fs.writeFileSync('.env', envContents);
      break;
    }
  }

  await bootstrap();
  checkmarkText('Seamless Init:', 'complete');
};

module.exports = { init };

const fs = require('fs');
const prompts = require('prompts');

const {
  logo,
  rightArrowText,
  checkmarkText,
  isValidUrl,
  isValidEmail,
} = require('../utils.js');

const questions = [
  {
    type: 'text',
    name: 'AWS_ACCOUNT_ID',
    message: 'Enter your AWS Account ID:',
    validate: (value) =>
      value.trim().length !== 0 || 'AWS Account ID cannot be empty',
  },
  {
    type: 'text',
    name: 'AWS_REGION',
    message: 'Enter your AWS region:',
    validate: (value) =>
      value.trim().length !== 0 || 'AWS region cannot be empty',
  },
  {
    type: 'text',
    name: 'GITHUB_CLIENT_ID',
    message: 'Enter your Github OAuth Client ID:',
    validate: (value) =>
      value.trim().length !== 0 || 'Github OAuth Client ID cannot be empty',
  },
  {
    type: 'text',
    name: 'GITHUB_CLIENT_SECRET',
    message: 'Enter your GitHub OAuth Client Secret:',
    validate: (value) =>
      value.trim().length !== 0 || 'Github OAuth Client Secret cannot be empty',
  },
  {
    type: 'text',
    name: 'SNS_SUBSCRIBER_URL',
    message: 'Enter your SNS Subscriber URL (optional):',
    initial: '',
    validate: (value) =>
      value.trim().length === 0 || isValidUrl(value) || 'Invalid URL',
  },
  {
    type: 'text',
    name: 'EMAIL_ADDRESS',
    message: 'Enter your email address (optional):',
    initial: '',
    validate: (value) =>
      value.trim().length === 0 ||
      isValidEmail(value) ||
      'Invalid email address',
  },
  {
    type: 'text',
    name: 'SLACK_WEBHOOK_URL',
    message: 'Enter your Slack Webhook URL (optional):',
    initial: '',
    validate: (value) =>
      value.trim().length === 0 || isValidUrl(value) || 'Invalid URL',
  },
];

const bootstrap = async () => {
  const { execa } = await require('../esmodules.js')();
  rightArrowText('Bootstrapping Seamless:', 'with AWS CDK');
  await execa('cdk', ['bootstrap']);
};

const init = async () => {
  const { chalk } = await require('../esmodules.js')();

  console.log(chalk.bold.blue('Welcome to the Seamless CLI!'));
  console.log(logo);

  rightArrowText('Initializing Seamless', 'Set up your CI/CD pipeline!\n');

  const answers = await prompts.prompt(questions);
  const envContents = Object.keys(answers)
    .filter((key) => answers[key])
    .map((key) => `${key}=${answers[key]}`)
    .join('\n');

  fs.writeFileSync('.env', envContents);

  console.log('\n');
  await bootstrap();
  checkmarkText('Seamless Init:', 'complete ✅');
};

module.exports = { init };

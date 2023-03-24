#!/usr/bin/env node

const commander = require('commander');
const { deploy } = require('./commands/deploy.js');
const { init } = require('./commands/init.js');

const program = new commander.Command();

// init: Load use input into a `.env` file
program
  .command('init')
  .alias('i')
  .description('initialize environment and bootstrap cdk')
  .action(init);

// deploy: Deploy the user's infrastructure to their AWS account
program
  .command('deploy')
  .alias('d')
  .description("Deploy the user's infrastructure to their AWS account")
  .action(deploy);

// teardown: Destroy the user's infrastructure
// program
//   .command('teardown')
//   .alias('t')
//   .description('init .env file and deploy infra using cdk deploy')
//   .action(deploy);

// // help
// program
//   .command('help')
//   .description('init .env file and deploy infra using cdk deploy')
//   .action(deploy);

program.parse(process.argv);

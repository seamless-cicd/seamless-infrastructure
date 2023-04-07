#!/usr/bin/env node

const { Command } = require('commander');
const { deploy } = require('./commands/deploy.js');
const { init } = require('./commands/init.js');
const { teardown } = require('./commands/teardown.js');

const program = new Command();

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
  .description("Deploy Seamless's AWS infrastructure.")
  .action(deploy);

// teardown: Destroy the user's infrastructure
program
  .command('teardown')
  .alias('t')
  .description("Destroy Seamless's AWS infrastructure.")
  .action(teardown);

program.parse(process.argv);

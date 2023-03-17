#!/usr/bin/env node

import { Command } from 'commander';
import deploy from './commands/deploy.js';

const program = new Command();

program
  .command('deploy')
  .alias('d')
  .description('init .env file and deploy infra using cdk deploy')
  .action(deploy);

program.parse(process.argv);
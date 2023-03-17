#!/usr/bin/env node

// "seamless": "CLI/cli.ts" is the bin command - after compilation
// maybe this will change to .js?

import { Command } from 'commander';
import deploy from './commands/deploy';

const program = new Command();

program
  .command('deploy')
  .alias('d')
  .description('init .env file and deploy infra using cdk deploy')
  .action(deploy);

program.parse(process.argv);
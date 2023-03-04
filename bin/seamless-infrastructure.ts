#!/usr/bin/env node
import { config } from 'dotenv';
config();

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SeamlessStack } from '../lib/seamless-stack';

const app = new cdk.App();

new SeamlessStack(app, 'SeamlessStack', {
  stackName: 'SeamlessStack',
});

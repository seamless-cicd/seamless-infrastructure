#!/usr/bin/env node
import { config } from 'dotenv';
config();

import * as cdk from 'aws-cdk-lib';
import 'source-map-support/register';
import { SeamlessStack } from '../lib/seamless-stack';

const app = new cdk.App();

new SeamlessStack(app, 'SeamlessStack', {
  stackName: 'SeamlessStack',
});

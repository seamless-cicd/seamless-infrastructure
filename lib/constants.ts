import dotenv from 'dotenv';
dotenv.config();

import { z } from 'zod';

const envSchema = z.object({
  AWS_ACCOUNT_ID: z.string(),
  AWS_REGION: z.string(),
  GITHUB_CLIENT_ID: z.string(),
  GITHUB_CLIENT_SECRET: z.string(),
  SNS_SUBSCRIBER_URL: z.string().url().optional(),
  EMAIL_ADDRESS: z.string().email().optional(),
  SLACK_WEBHOOK_URL: z.string().optional(),
  ALLOWED_IPS: z.string(),
});

export type EnvVars = z.infer<typeof envSchema>;

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error(
    'Invalid environment variables:',
    JSON.stringify(parsedEnv.error.format()),
  );
  process.exit(1);
}

export const {
  AWS_ACCOUNT_ID,
  AWS_REGION,
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  SNS_SUBSCRIBER_URL,
  EMAIL_ADDRESS,
  SLACK_WEBHOOK_URL,
  ALLOWED_IPS,
} = parsedEnv.data;

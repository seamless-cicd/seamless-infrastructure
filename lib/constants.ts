import dotenv from 'dotenv';
dotenv.config();

import { z } from 'zod';

const envSchema = z.object({
  AWS_ACCOUNT_ID: z.string(),
  AWS_ACCESS_KEY: z.string(),
  AWS_SECRET_ACCESS_KEY: z.string(),
  GITHUB_PAT: z.string(),
  GITHUB_REPO_URL: z.string().url(),
  SNS_SUBSCRIBER_URL: z.string().url(),
});

export type EnvVars = z.infer<typeof envSchema>;

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error(
    'Invalid environment variables:',
    JSON.stringify(parsedEnv.error.format())
  );
  process.exit(1);
}

export const {
  AWS_ACCOUNT_ID,
  AWS_ACCESS_KEY,
  AWS_SECRET_ACCESS_KEY,
  GITHUB_PAT,
  GITHUB_REPO_URL,
  SNS_SUBSCRIBER_URL,
} = parsedEnv.data;

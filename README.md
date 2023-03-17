# Seamless Infrastructure

Seamless's core AWS infrastructure. The major constructs in Seamless's infrastructure are described below.

## Resources Created

### VPC

A single non-default Virtual Private Cloud.

### EC2 Instance

An EC2 instance that hosts Seamless's backend Express server.

### Step Functions

An AWS-native state machine that coordinates the logic of Seamless's CI/CD pipeline.

### SNS Topic

An SNS topic for notifying our backend about pipeline status.

### RDS Instance

A Postgres database hosted on RDS storing all pipeline data.

### ElastiCache Redis Cluster

A Redis node hosted on ElastiCache for storing logs.

### ECS Cluster on EC2

An ECS cluster used for running pipeline tasks.

## Developer Information

To deploy the CDK:

- Create a `.env` environment variable containing the appropriate properties from `.env.example`
- If errors occur during deployment, do not prematurely quit the CDK. Allow the rollback to finish completely, fix the broken IaC, and redeploy.

To test the state machine for development:

- Locate the appropriate Step Function in the AWS console
- Pass input in the format specified in `state_machine_input.example.json`

### Useful commands

- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `cdk deploy` deploy this stack to your default AWS account/region
- `cdk diff` compare deployed stack with current state
- `cdk synth` emits the synthesized CloudFormation template
- `seamless deploy` will init `.env` file and deploy with aws cdk (npm package needs to be installed globally)

### Testing commands

- `node CLI/cli.js deploy`
  - This will be `seamless deploy` in production when infrastructure npm package is installed globally
  - Run from project root
  - This will create a `.env` file - will overwrite existing `.env` so enter variables as needed (it asks for the variables in `.env.example`)
  - Will automatically run aws `cdk deploy`

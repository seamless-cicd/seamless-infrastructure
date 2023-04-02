![logo name](https://user-images.githubusercontent.com/74154385/229306579-2e820193-cd80-417d-9ee3-bab904cca774.png)

## Overview

> _Seamless automates the deployment process from push to Prod_

Seamless is a self-hosted, open-source, cloud-native CI/CD solution tailored for microservices. Seamless offers a low-configuration platform for automating the testing, building, and deployment of containerized microservice applications.

To learn more about Seamless read our case study.

## Infrastructure

Seamless's core AWS infrastructure. The major constructs in Seamless's infrastructure are described below.

![architecture](https://user-images.githubusercontent.com/74154385/228690435-514f976b-40e0-482a-80de-3685aec20f9c.png)

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

## Deployment Information

### Prerequisites

- [AWS CLI](https://docs.aws.amazon.com/cli/index.html)
- [AWS CDK](https://docs.aws.amazon.com/cdk/api/v2/)
- Node.js
- NPM

To use Seamless the AWS CLI and AWS CDK is required. Additionally, Seamless presupposes a microservices application hosted on AWS Fargate. To install Seamless `npm` is required.

### Commands

The following commands will guide you through the setup:

```sh
npm install -g seamless
```

- Global installation is required.

```sh
seamless init
```

- Provide input as prompted to create a `.env` file which will be needed for infrastructure deployment.

```sh
seamless deploy
```
- This will provision Seamless infrastructure in AWS. Upon completion a URL to the Dashboard UI will be provided.

```sh
seamless teardown
```
- Removes infrastructure

## Developer Information

To deploy the CDK:

- Create a `.env` environment variable containing the appropriate properties from `.env.example`
- If errors occur during deployment, do not prematurely quit the CDK. Allow the rollback to finish completely, fix the broken IaC, and redeploy.

To test the state machine for development:

- Locate the appropriate Step Function in the AWS console
- Pass input in the format specified in `step_function_input.example.json`

### Useful commands

- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `cdk deploy` deploy this stack to your default AWS account/region
- `cdk diff` compare deployed stack with current state
- `cdk synth` emits the synthesized CloudFormation template

## The Team
**<a href="https://github.com/jasonherngwang" target="_blank">Jason Wang</a>** _Software Engineer_ • Los Angeles, CA

**<a href="https://github.com/ethanjweiner" target="_blank">Ethan Weiner</a>** _Software Engineer_ • Boston, MA

**<a href="https://github.com/RDeJonghe" target="_blank">Ryan DeJonghe</a>** _Software Engineer_ • Denver, CO

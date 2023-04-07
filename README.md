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

### Installing Seamless

1. [Create an OAuth app](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app) for Seamless. For now, put any input in the homepage and callback URLs. We will fill them out after deploying Seamless. Save your client ID and Secret.
2. Run `npm install -g @seamless-cicd/seamless` to install the Seamless CLI
3. Run `seamless init` to provide the input needed for deploying Seamless, and to boostrap your AWS account. Provide your OAuth app client ID and secret when prompted.
4. Run `seamless deploy` to provision Seamless infrastructure in AWS. Upon completion a URL to the Dashboard GUI will be provided. Save this URL; it is the URL you will use to interact with Seamless.
5. Return to the settings for the OAuth app you used to setup Seamless, and copy the URL into the homepage URL and callback URL fields.
6. You are ready to start using Seamless!

### Uninstalling Seamless

1. Run `seamless teardown` to remove all AWS infrastructure associated with Seamless.
2. Delete the OAuth app you created for Seamless.

## The Team

**<a href="https://github.com/jasonherngwang" target="_blank">Jason Wang</a>** _Software Engineer_ • Los Angeles, CA

**<a href="https://github.com/ethanjweiner" target="_blank">Ethan Weiner</a>** _Software Engineer_ • Boston, MA

**<a href="https://github.com/RDeJonghe" target="_blank">Ryan DeJonghe</a>** _Software Engineer_ • Denver, CO

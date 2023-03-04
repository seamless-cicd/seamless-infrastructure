import * as cdk from 'aws-cdk-lib';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';
import { ContainerDefinition } from 'aws-cdk-lib/aws-ecs';

import { config } from 'dotenv';
config();

export interface StateMachineStackProps extends cdk.NestedStackProps {
  topic: cdk.aws_sns.Topic;
  ecsCluster: ecs.Cluster;
  prepareTaskDefinition: ecs.TaskDefinition;
  codeQualityTaskDefinition: ecs.TaskDefinition;
  testTaskDefinition: ecs.TaskDefinition;
  buildTaskDefinition: ecs.TaskDefinition;
  deployTaskDefinition: ecs.TaskDefinition;
  sampleSuccessTaskDefinition: ecs.TaskDefinition;
  sampleFailureTaskDefinition: ecs.TaskDefinition;
}

enum Stage {
  START = 'START',
  PREPARE = 'PREPARE',
  CODE_QUALITY = 'CODE_QUALITY',
  TEST = 'TEST',
  BUILD = 'BUILD',
  DEPLOY = 'DEPLOY',
}

enum StageStatus {
  SUCCESS = 'STAGE_SUCCESS',
  FAILURE = 'STAGE_FAILURE',
}

// NOTE: State machine expects a particular JSON payload. See `/state_machine_input.example.json` for more information
export class StateMachineStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props?: StateMachineStackProps) {
    super(scope, id, props);

    // Prop validation
    if (!props?.topic) {
      throw new Error('Topic not found');
    }

    if (!props?.ecsCluster) {
      throw new Error('ECS cluster not provided');
    }

    if (!props?.sampleSuccessTaskDefinition) {
      throw new Error('No sample success definition provided');
    }

    // Placeholder starting state
    const start = new sfn.Pass(this, 'Start');

    // SNS notification tasks
    const createNotificationState = (id: string, message: object) => {
      return new tasks.SnsPublish(this, id, {
        topic: props.topic,
        message: sfn.TaskInput.fromObject(message),
      });
    };

    // Define actions to run on a stage success
    const tasksOnSuccess = (stage: Stage) => {
      const notifySuccess = createNotificationState(`Notify ${stage} Success`, {
        status: StageStatus.SUCCESS,
      });

      return notifySuccess;
    };

    // Define actions to run on a stage failure
    const tasksOnFailure = () => {
      const notifyFailure = createNotificationState(`Notify Pipeline Failure`, {
        status: StageStatus.FAILURE,
      });

      return notifyFailure.next(new sfn.Fail(this, `Failure`));
    };

    const failureChain = tasksOnFailure();

    // Create an ECS run task with a given task definition
    // Entire environment passed as input is injecteed into the task
    const createEcsRunTask = (
      stage: Stage,
      taskDefinition: ecs.TaskDefinition
    ) => {
      return new tasks.EcsRunTask(this, stage, {
        integrationPattern: sfn.IntegrationPattern.RUN_JOB,
        cluster: props.ecsCluster,
        taskDefinition,
        containerOverrides: [
          {
            containerDefinition:
              taskDefinition.defaultContainer as ContainerDefinition,
            environment: [
              {
                name: 'AWS_ACCOUNT_ID',
                value: sfn.JsonPath.stringAt(
                  '$.containerVariables.awsAccountId'
                ),
              },
              {
                name: 'AWS_ACCESS_KEY',
                value: sfn.JsonPath.stringAt(
                  '$.containerVariables.awsAccessKey'
                ),
              },
              {
                name: 'AWS_SECRET_ACCESS_KEY',
                value: sfn.JsonPath.stringAt(
                  '$.containerVariables.awsAccessKey'
                ),
              },
              {
                name: 'GH_PAT',
                value: sfn.JsonPath.stringAt('$.containerVariables.ghPat'),
              },
              {
                name: 'GH_REPO',
                value: sfn.JsonPath.stringAt('$.containerVariables.ghRepo'),
              },
              {
                name: 'CODE_QUALITY_COMMAND',
                value: sfn.JsonPath.stringAt(
                  '$.containerVariables.codeQualityCommand'
                ),
              },
              {
                name: 'TEST_COMMAND',
                value: sfn.JsonPath.stringAt(
                  '$.containerVariables.testCommand'
                ),
              },
              {
                name: 'DOCKERFILE_PATH',
                value: sfn.JsonPath.stringAt(
                  '$.containerVariables.dockerfilePath'
                ),
              },
              {
                name: 'AWS_FARGATE_CLUSTER',
                value: sfn.JsonPath.stringAt(
                  '$.containerVariables.awsEcsCluster'
                ),
              },
              {
                name: 'AWS_FARGATE_SERVICE',
                value: sfn.JsonPath.stringAt(
                  '$.containerVariables.awsEcsService'
                ),
              },
              {
                name: 'AWS_ECR_REPO',
                value: sfn.JsonPath.stringAt('$.containerVariables.awsEcrRepo'),
              },
            ],
          },
        ],
        subnets: {
          subnetType: ec2.SubnetType.PUBLIC,
        },
        launchTarget: new tasks.EcsEc2LaunchTarget({
          placementStrategies: [ecs.PlacementStrategy.spreadAcrossInstances()],
        }),
      }).addCatch(failureChain, {
        resultPath: '$.error',
      });
    };

    // Swap out task definitions as you go
    const prepareTask = createEcsRunTask(
      Stage.PREPARE,
      props.sampleSuccessTaskDefinition
    );

    const codeQualityTask = createEcsRunTask(
      Stage.CODE_QUALITY,
      props.sampleSuccessTaskDefinition
    );

    const testTask = createEcsRunTask(
      Stage.TEST,
      props.sampleSuccessTaskDefinition
    );

    const buildTask = createEcsRunTask(
      Stage.BUILD,
      props.sampleSuccessTaskDefinition
    );

    const deployTask = createEcsRunTask(
      Stage.DEPLOY,
      props.sampleSuccessTaskDefinition
    );

    const success = new sfn.Succeed(this, 'Success');

    // Define the machine
    const definition = start
      .next(prepareTask)
      .next(tasksOnSuccess(Stage.PREPARE))
      .next(codeQualityTask)
      .next(tasksOnSuccess(Stage.CODE_QUALITY))
      .next(testTask)
      .next(tasksOnSuccess(Stage.TEST))
      .next(buildTask)
      .next(tasksOnSuccess(Stage.BUILD))
      .next(deployTask)
      .next(tasksOnSuccess(Stage.DEPLOY))
      .next(success);

    // Create a state machine that times out after 1 hour of runtime
    new sfn.StateMachine(this, 'SeamlessStateMachine', {
      definition,
      timeout: cdk.Duration.minutes(60),
    });
  }
}

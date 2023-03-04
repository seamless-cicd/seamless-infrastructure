import { NestedStack, NestedStackProps, Duration } from 'aws-cdk-lib';
import {
  StateMachine,
  Pass,
  Fail,
  Succeed,
  TaskInput,
  IntegrationPattern,
  JsonPath,
} from 'aws-cdk-lib/aws-stepfunctions';
import { Topic } from 'aws-cdk-lib/aws-sns';
import {
  Cluster,
  PlacementStrategy,
  Ec2TaskDefinition,
} from 'aws-cdk-lib/aws-ecs';
import {
  SnsPublish,
  EcsRunTask,
  EcsEc2LaunchTarget,
} from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { ContainerDefinition } from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';

import { config } from 'dotenv';
config();

export interface StateMachineStackProps extends NestedStackProps {
  readonly topic: Topic;
  readonly ecsCluster: Cluster;
  readonly prepareTaskDefinition: Ec2TaskDefinition;
  readonly codeQualityTaskDefinition: Ec2TaskDefinition;
  readonly unitTestTaskDefinition: Ec2TaskDefinition;
  readonly buildTaskDefinition: Ec2TaskDefinition;
  readonly integrationTestTaskDefinition: Ec2TaskDefinition;
  readonly deployStagingTaskDefinition: Ec2TaskDefinition;
  readonly deployProdTaskDefinition: Ec2TaskDefinition;
  readonly sampleSuccessTaskDefinition: Ec2TaskDefinition;
  readonly sampleFailureTaskDefinition: Ec2TaskDefinition;
}

enum Stage {
  START = 'START',
  PREPARE = 'PREPARE',
  CODE_QUALITY = 'CODE_QUALITY',
  UNIT_TEST = 'UNIT_TEST',
  BUILD = 'BUILD',
  INTEGRATION_TEST = 'INTEGRATION_TEST',
  DEPLOY_STAGING = 'DEPLOY_STAGING',
  DEPLOY_PROD = 'DEPLOY_PROD',
}

enum StageStatus {
  SUCCESS = 'STAGE_SUCCESS',
  FAILURE = 'STAGE_FAILURE',
}

// NOTE: State machine expects a particular JSON payload. See `/state_machine_input.example.json` for more information
export class StateMachineStack extends NestedStack {
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
    const start = new Pass(this, 'Start');

    // SNS notification tasks
    const createNotificationState = (id: string, message: object) => {
      return new SnsPublish(this, id, {
        topic: props.topic,
        message: TaskInput.fromObject(message),
        resultPath: '$.lastTaskOutput',
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

      return notifyFailure.next(new Fail(this, `Failure`));
    };

    const failureChain = tasksOnFailure();

    // Create an ECS run task with a given task definition
    // Entire environment passed as input is injecteed into the task
    const createEcsRunTask = (
      stage: Stage,
      taskDefinition: Ec2TaskDefinition
    ) => {
      return new EcsRunTask(this, stage, {
        integrationPattern: IntegrationPattern.RUN_JOB,
        cluster: props.ecsCluster,
        taskDefinition,
        containerOverrides: [
          {
            containerDefinition:
              taskDefinition.defaultContainer as ContainerDefinition,
            environment: [
              {
                name: 'AWS_ACCOUNT_ID',
                value: JsonPath.stringAt('$.containerVariables.awsAccountId'),
              },
              {
                name: 'AWS_ACCESS_KEY',
                value: JsonPath.stringAt('$.containerVariables.awsAccessKey'),
              },
              {
                name: 'AWS_SECRET_ACCESS_KEY',
                value: JsonPath.stringAt('$.containerVariables.awsAccessKey'),
              },
              {
                name: 'GITHUB_PAT',
                value: JsonPath.stringAt('$.containerVariables.githubPat'),
              },
              {
                name: 'GITHUB_REPO_URL',
                value: JsonPath.stringAt('$.containerVariables.githubRepoUrl'),
              },
              {
                name: 'CODE_QUALITY_COMMAND',
                value: JsonPath.stringAt(
                  '$.containerVariables.codeQualityCommand'
                ),
              },
              {
                name: 'UNIT_TEST_COMMAND',
                value: JsonPath.stringAt(
                  '$.containerVariables.unitTestCommand'
                ),
              },
              {
                name: 'DOCKERFILE_PATH',
                value: JsonPath.stringAt('$.containerVariables.dockerfilePath'),
              },
              {
                name: 'AWS_ECS_CLUSTER',
                value: JsonPath.stringAt('$.containerVariables.awsEcsCluster'),
              },
              {
                name: 'AWS_ECS_SERVICE',
                value: JsonPath.stringAt('$.containerVariables.awsEcsService'),
              },
              {
                name: 'AWS_ECR_REPO',
                value: JsonPath.stringAt('$.containerVariables.awsEcrRepo'),
              },
            ],
          },
        ],
        resultPath: '$.lastTaskOutput',
        launchTarget: new EcsEc2LaunchTarget({
          placementStrategies: [PlacementStrategy.spreadAcrossInstances()],
        }),
      }).addCatch(failureChain, {
        resultPath: '$.error',
      });
    };

    // Swap out task definitions as you go
    const prepareTask = createEcsRunTask(
      Stage.PREPARE,
      props.prepareTaskDefinition
    );

    const codeQualityTask = createEcsRunTask(
      Stage.CODE_QUALITY,
      props.codeQualityTaskDefinition
    );

    const unitTestTask = createEcsRunTask(
      Stage.UNIT_TEST,
      props.unitTestTaskDefinition
    );

    const buildTask = createEcsRunTask(Stage.BUILD, props.buildTaskDefinition);

    const deployTask = createEcsRunTask(
      Stage.DEPLOY_PROD,
      props.sampleSuccessTaskDefinition
    );

    const success = new Succeed(this, 'Success');

    // Define the machine
    const definition = start
      .next(prepareTask)
      .next(tasksOnSuccess(Stage.PREPARE))
      .next(codeQualityTask)
      .next(tasksOnSuccess(Stage.CODE_QUALITY))
      .next(unitTestTask)
      .next(tasksOnSuccess(Stage.UNIT_TEST))
      .next(buildTask)
      .next(tasksOnSuccess(Stage.BUILD))
      .next(deployTask)
      .next(tasksOnSuccess(Stage.DEPLOY_PROD))
      .next(success);

    // Create a state machine that times out after 1 hour of runtime
    new StateMachine(this, 'SeamlessStateMachine', {
      definition,
      timeout: Duration.minutes(60),
    });
  }
}

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

enum StageType {
  PREPARE = 'PREPARE',
  CODE_QUALITY = 'CODE_QUALITY',
  UNIT_TEST = 'UNIT_TEST',
  BUILD = 'BUILD',
  INTEGRATION_TEST = 'INTEGRATION_TEST',
  DEPLOY_STAGING = 'DEPLOY_STAGING',
  DEPLOY_PROD = 'DEPLOY_PROD',
  OTHER = 'OTHER',
}

enum Status {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  IN_PROGRESS = 'IN_PROGRESS',
  IDLE = 'IDLE',
}

const stageEnumToId = {
  [StageType.PREPARE]: 'prepare',
  [StageType.CODE_QUALITY]: 'codeQuality',
  [StageType.UNIT_TEST]: 'unitTest',
  [StageType.BUILD]: 'build',
  [StageType.INTEGRATION_TEST]: 'integrationTest',
  [StageType.DEPLOY_STAGING]: 'deployStaging',
  [StageType.DEPLOY_PROD]: 'deployProduction',
  [StageType.OTHER]: 'deployProduction',
};

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

    // Stage transitions
    const createStageTransition = (
      lastStage: StageType | null,
      currentStage: StageType | null
    ) => {
      return new Pass(this, `Transition: ${lastStage} -> ${currentStage}`, {
        result: TaskInput.fromObject({
          lastStage,
          currentStage,
        }),
        resultPath: '$.stages',
      });
    };

    // SNS notification tasks
    const createNotificationState = (id: string, message: object) => {
      return new SnsPublish(this, id, {
        topic: props.topic,
        message: TaskInput.fromObject(message),
        resultPath: '$.lastTaskOutput',
      });
    };

    // Define actions to run on a stage success
    const tasksOnSuccess = (stage: StageType) => {
      const notifySuccess = createNotificationState(`Notify ${stage} Success`, {
        status: Status.SUCCESS,
      });

      return notifySuccess;
    };

    // Define actions to run on a stage failure
    const tasksOnFailure = () => {
      const notifyFailure = createNotificationState(`Notify Pipeline Failure`, {
        status: Status.FAILURE,
      });

      return notifyFailure.next(new Fail(this, `Failure`));
    };

    const failureChain = tasksOnFailure();

    // Create an ECS run task with a given task definition
    // Entire environment passed as input is injecteed into the task
    const createEcsRunTask = (
      stage: StageType,
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
                name: 'STAGE_ID',
                value: JsonPath.stringAt(`$.stageIds.${stageEnumToId[stage]}`),
              },
              {
                name: 'AWS_REGION',
                value: JsonPath.stringAt('$.containerVariables.awsRegion'),
              },
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
      StageType.PREPARE,
      props.prepareTaskDefinition
    );

    const codeQualityTask = createEcsRunTask(
      StageType.CODE_QUALITY,
      props.codeQualityTaskDefinition
    );

    const unitTestTask = createEcsRunTask(
      StageType.UNIT_TEST,
      props.unitTestTaskDefinition
    );

    const buildTask = createEcsRunTask(
      StageType.BUILD,
      props.buildTaskDefinition
    );

    const deployTask = createEcsRunTask(
      StageType.DEPLOY_PROD,
      props.sampleSuccessTaskDefinition
    );

    const success = new Succeed(this, 'Success');

    // Define the machine
    const definition = start
      .next(createStageTransition(null, StageType.PREPARE))
      .next(prepareTask)
      .next(tasksOnSuccess(StageType.PREPARE))
      .next(createStageTransition(StageType.PREPARE, StageType.CODE_QUALITY))
      .next(codeQualityTask)
      .next(tasksOnSuccess(StageType.CODE_QUALITY))
      .next(createStageTransition(StageType.CODE_QUALITY, StageType.UNIT_TEST))
      .next(unitTestTask)
      .next(tasksOnSuccess(StageType.UNIT_TEST))
      .next(createStageTransition(StageType.UNIT_TEST, StageType.BUILD))
      .next(buildTask)
      .next(tasksOnSuccess(StageType.BUILD))
      .next(createStageTransition(StageType.BUILD, StageType.DEPLOY_PROD))
      .next(deployTask)
      .next(tasksOnSuccess(StageType.DEPLOY_PROD))
      .next(createStageTransition(StageType.DEPLOY_PROD, null))
      .next(success);

    // Create a state machine that times out after 1 hour of runtime
    new StateMachine(this, 'SeamlessStateMachine', {
      definition,
      timeout: Duration.minutes(60),
    });
  }
}

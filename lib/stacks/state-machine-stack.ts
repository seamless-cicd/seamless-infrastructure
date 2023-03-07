import { NestedStack, NestedStackProps, Duration } from 'aws-cdk-lib';
import {
  StateMachine,
  Pass,
  Fail,
  Succeed,
  TaskInput,
  IntegrationPattern,
  JsonPath,
  Chain,
  Result,
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
import {} from 'aws-sdk/clients/rdsdataservice';

import { config } from 'dotenv';
import { DatabaseInstance } from 'aws-cdk-lib/aws-rds';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
config();

export interface StateMachineStackProps extends NestedStackProps {
  readonly topic: Topic;
  readonly ecsCluster: Cluster;
  readonly rdsInstance: DatabaseInstance;
  readonly vpc: IVpc;
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

enum TriggerType {
  MAIN = 'MAIN',
  PR_OPEN = 'PR_OPEN',
  PR_SYNC = 'PR_SYNC',
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

interface StageData {
  id: string;
  type: StageType;
  status: Status;
}

interface RunData {
  status: Status;
  commitHash: string;
  commitMessage: string;
  committer: string;
  triggerType: TriggerType;
  stages: StageData[];
}

// TODO: Update Stage Order as state machine expands
const StageOrder = [
  StageType.PREPARE,
  StageType.CODE_QUALITY,
  StageType.UNIT_TEST,
  StageType.BUILD,
  StageType.DEPLOY_PROD,
];

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
        stageStatus: Status.SUCCESS,
        runData: JsonPath.objectAt(`$.runData`),
      });

      return notifySuccess;
    };

    // Define actions to run on a stage failure
    const tasksOnFailure = () => {
      const notifyFailure = createNotificationState(`Notify Pipeline Failure`, {
        stageStatus: Status.FAILURE,
        runData: JsonPath.objectAt(`$.runData`),
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
              {
                name: 'LOG_SUBSCRIBER_URL',
                value: JsonPath.stringAt(
                  '$.containerVariables.logSubscriberUrl'
                ),
              },
            ],
          },
        ],
        resultPath: '$.lastTaskOutput',
        launchTarget: new EcsEc2LaunchTarget({
          placementStrategies: [PlacementStrategy.spreadAcrossInstances()],
        }),
      });
    };

    const createUpdateStageStatusTask = (stage: StageType, status: Status) => {
      return new Pass(this, `Update ${stage} to ${status}`, {
        result: Result.fromString(status),
        resultPath: `$.runData.stages.${stageEnumToId[stage]}.status`,
      });
    };

    // Stage
    const createStage = (
      currentStage: StageType,
      taskDefinition: Ec2TaskDefinition
    ) => {
      const stageIndex = StageOrder.indexOf(currentStage);

      let updatePreviousStageInState;
      let updatePreviousStageInDb;

      if (stageIndex > 0) {
        updatePreviousStageInState = createUpdateStageStatusTask(
          StageOrder[stageIndex - 1],
          Status.SUCCESS
        );
      }

      const updateCurrentStageInState = createUpdateStageStatusTask(
        currentStage,
        Status.IN_PROGRESS
      );

      const ecsRunTask = createEcsRunTask(
        currentStage,
        taskDefinition
      ).addCatch(failureChain, {
        resultPath: '$.error',
      });

      if (updatePreviousStageInState && updatePreviousStageInDb) {
        return updatePreviousStageInState
          .next(updateCurrentStageInState)
          .next(updatePreviousStageInDb)
          .next(ecsRunTask)
          .next(tasksOnSuccess(currentStage));
      } else {
        return updateCurrentStageInState
          .next(ecsRunTask)
          .next(tasksOnSuccess(currentStage));
      }
    };

    const success = new Succeed(this, 'Success');

    // Define the machine
    const definition = Chain.start(
      createStage(StageType.PREPARE, props.prepareTaskDefinition)
    )
      .next(
        createStage(StageType.CODE_QUALITY, props.codeQualityTaskDefinition)
      )
      .next(createStage(StageType.UNIT_TEST, props.unitTestTaskDefinition))
      .next(createStage(StageType.BUILD, props.buildTaskDefinition))
      .next(
        createStage(StageType.DEPLOY_PROD, props.sampleSuccessTaskDefinition)
      )
      .next(success);

    // Create a state machine that times out after 1 hour of runtime
    new StateMachine(this, 'SeamlessStateMachine', {
      definition,
      timeout: Duration.minutes(60),
    });
  }
}

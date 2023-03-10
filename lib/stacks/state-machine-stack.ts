import { NestedStack, NestedStackProps, Duration, Stack } from 'aws-cdk-lib';
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
  Choice,
  Condition,
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
  CallApiGatewayHttpApiEndpoint,
  HttpMethod,
} from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { ContainerDefinition } from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';

import { config } from 'dotenv';
import { DatabaseInstance } from 'aws-cdk-lib/aws-rds';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { CfnApi } from 'aws-cdk-lib/aws-apigatewayv2';
import { randomUUID } from 'crypto';
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
  readonly httpApi: CfnApi;
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

interface StageData {
  id: string;
  type: StageType;
  status: Status;
}

// TODO: Update Stage Order as state machine expands
const StageOrder = [
  StageType.PREPARE,
  StageType.CODE_QUALITY,
  StageType.UNIT_TEST,
  StageType.BUILD,
  StageType.DEPLOY_STAGING,
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
      // Send SNS notification
      const notifySuccess = createNotificationState(
        `Notify: ${stage} succeeded`,
        {
          stageStatus: Status.SUCCESS,
          runStatus: JsonPath.objectAt(`$.runStatus`),
        }
      );

      // Mark own state as complete
      const updateCurrentStageInState = createUpdateStageStatusTask(
        stage,
        Status.SUCCESS
      );

      return notifySuccess
        .next(updateCurrentStageInState)
        .next(createUpdateDbStatusTask());
    };

    // Define actions to run on a pipeline failure
    const tasksOnPipelineFailure = new Pass(
      this,
      `Update state machine context: Run is now ${Status.FAILURE}`,
      {
        result: Result.fromString(Status.FAILURE),
        resultPath: `$.runStatus.run.status`,
      }
    )
      .next(
        createNotificationState(`Notify: Pipeline failed`, {
          stageStatus: Status.FAILURE,
          runStatus: JsonPath.objectAt(`$.runStatus`),
        })
      )
      .next(new Fail(this, `Pipeline failed`));

    // Define actions to run on a stage failure
    const tasksOnFailure = (stage: StageType) => {
      const notifyFailure = createNotificationState(`Notify: ${stage} failed`, {
        stageStatus: Status.FAILURE,
        runStatus: JsonPath.objectAt(`$.runStatus`),
      });

      const updateCurrentStageInState = createUpdateStageStatusTask(
        stage,
        Status.FAILURE
      );

      return notifyFailure
        .next(updateCurrentStageInState)
        .next(createUpdateDbStatusTask())
        .next(tasksOnPipelineFailure);
    };

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
                name: 'AWS_ECS_CLUSTER_STAGING',
                value: JsonPath.stringAt(
                  '$.containerVariables.awsEcsClusterStaging'
                ),
              },
              {
                name: 'AWS_ECS_SERVICE_STAGING',
                value: JsonPath.stringAt(
                  '$.containerVariables.awsEcsServiceStaging'
                ),
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
      return new Pass(
        this,
        `Update state machine context: ${stage} is now ${status}`,
        {
          result: Result.fromString(status),
          resultPath: `$.runStatus.stages.${stageEnumToId[stage]}.status`,
        }
      );
    };

    // TODO: Granularize database updates?
    const createUpdateDbStatusTask = () => {
      return new CallApiGatewayHttpApiEndpoint(
        this,
        `SeamlessCallHttpApiEndpoint-${randomUUID()}`,
        {
          apiId: props.httpApi.attrApiId,
          apiStack: Stack.of(props.httpApi),
          method: HttpMethod.POST,
          requestBody: TaskInput.fromJsonPathAt('$.runStatus'),
          apiPath: '/internal/status-updates',
        }
      );
    };

    // Helper that creates Step Function Steps which spin up ECS containers
    const createStage = (
      currentStage: StageType,
      taskDefinition: Ec2TaskDefinition
    ) => {
      // Mark current Stage as in progress
      const updateCurrentStageInState = createUpdateStageStatusTask(
        currentStage,
        Status.IN_PROGRESS
      );

      const ecsRunTask = createEcsRunTask(
        currentStage,
        taskDefinition
      ).addCatch(tasksOnFailure(currentStage), {
        resultPath: '$.error',
      });

      return updateCurrentStageInState
        .next(createUpdateDbStatusTask())
        .next(ecsRunTask)
        .next(tasksOnSuccess(currentStage));
    };

    // Success: Final state of entire pipeline
    const success = new Pass(
      this,
      `Update state machine context: Run is now ${Status.SUCCESS}`,
      {
        result: Result.fromString(Status.SUCCESS),
        resultPath: `$.runStatus.run.status`,
      }
    )
      .next(
        createNotificationState('Notify: Pipeline succeeded', {
          stageStatus: Status.SUCCESS,
          runStatus: JsonPath.objectAt(`$.runStatus`),
        })
      )
      .next(new Succeed(this, 'Pipeline succeeded'));

    const prodChain = createStage(
      StageType.DEPLOY_PROD,
      props.deployProdTaskDefinition
    ).next(success);

    // Placeholder; replace with Lambda
    const waitForManualApproval = new Pass(
      this,
      'Wait for manual approval of Staging environment'
    ).next(prodChain);

    const autoDeployChoice = new Choice(this, 'Auto deploy to Prod?')
      .when(Condition.booleanEquals('$.autoDeploy', true), prodChain)
      .otherwise(waitForManualApproval);

    const stagingChain = createStage(
      StageType.DEPLOY_STAGING,
      props.deployStagingTaskDefinition
    ).next(autoDeployChoice);

    const stagingChoice = new Choice(this, 'Use a Staging environment?')
      .when(Condition.booleanEquals('$.useStaging', true), stagingChain)
      .otherwise(prodChain);

    const buildChain = createStage(
      StageType.BUILD,
      props.buildTaskDefinition
    ).next(stagingChoice);

    const fullPipelineChoice = new Choice(this, 'Run full pipeline?')
      .when(Condition.booleanEquals('$.runFull', true), buildChain)
      .otherwise(success);

    const definition = createNotificationState('Notify: Pipeline started', {
      stageStatus: Status.IN_PROGRESS,
      runStatus: JsonPath.objectAt(`$.runStatus`),
    })
      .next(
        new Pass(
          this,
          `Update state machine context: Run is now ${Status.IN_PROGRESS}`,
          {
            result: Result.fromString(Status.IN_PROGRESS),
            resultPath: `$.runStatus.run.status`,
          }
        )
      )
      .next(createStage(StageType.PREPARE, props.prepareTaskDefinition))
      .next(
        createStage(StageType.CODE_QUALITY, props.codeQualityTaskDefinition)
      )
      .next(createStage(StageType.UNIT_TEST, props.unitTestTaskDefinition))
      .next(fullPipelineChoice);

    // Create a state machine that times out after 1 hour of runtime
    new StateMachine(this, 'SeamlessStateMachine', {
      definition,
      timeout: Duration.minutes(60),
    });
  }
}

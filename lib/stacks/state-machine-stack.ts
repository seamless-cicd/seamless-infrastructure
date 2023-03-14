import {
  NestedStack,
  NestedStackProps,
  Duration,
  Stack,
  CfnOutput,
} from 'aws-cdk-lib';
import {
  StateMachine,
  Pass,
  Fail,
  Succeed,
  TaskInput,
  IntegrationPattern,
  JsonPath,
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

import { IVpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { CfnApi } from 'aws-cdk-lib/aws-apigatewayv2';
import { randomUUID } from 'crypto';

import { config } from 'dotenv';
config();

export interface StateMachineStackProps extends NestedStackProps {
  readonly vpc: IVpc;
  readonly ecsCluster: Cluster;
  readonly httpApi: CfnApi;
  readonly topic: Topic;
  readonly prepareTaskDefinition: Ec2TaskDefinition;
  readonly codeQualityTaskDefinition: Ec2TaskDefinition;
  readonly unitTestTaskDefinition: Ec2TaskDefinition;
  readonly buildTaskDefinition: Ec2TaskDefinition;
  readonly integrationTestTaskDefinition: Ec2TaskDefinition;
  readonly deployStagingTaskDefinition: Ec2TaskDefinition;
  readonly deployProdTaskDefinition: Ec2TaskDefinition;
}

// Enums
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

// Used to convert enums to field names
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

// NOTE: State machine expects a particular JSON payload.
// See `/state_machine_input.example.json`
export class StateMachineStack extends NestedStack {
  readonly stateMachine: StateMachine;

  constructor(scope: Construct, id: string, props?: StateMachineStackProps) {
    super(scope, id, props);

    // Prop validation
    if (!props?.vpc) {
      throw new Error('VPC not provided');
    }

    if (!props?.ecsCluster) {
      throw new Error('ECS cluster not provided');
    }

    if (!props?.httpApi) {
      throw new Error('HTTP API not found');
    }

    if (!props?.topic) {
      throw new Error('Topic not found');
    }

    // SNS notification task
    const createNotificationState = (id: string, message: object) => {
      return new SnsPublish(this, id, {
        topic: props.topic,
        message: TaskInput.fromObject(message),
        resultPath: '$.lastTaskOutput',
      });
    };

    // Context object update task
    // The shape of this object is in `/state_machine_input.example.json`, field `runStatus`
    // This context is passed through every stage
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

    // Status update task
    // Sends entire state machine context to API Gateway (internal route)
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
          headers: TaskInput.fromObject({
            'Content-Type': ['application/json'],
          }),
          resultPath: '$.lastTaskOutput',
        }
      );
    };

    // Pipeline success tasks
    const success = createNotificationState('Notify: Pipeline succeeded', {
      stageStatus: Status.SUCCESS,
      runStatus: JsonPath.objectAt(`$.runStatus`),
    })
      .next(
        new Pass(
          this,
          `Update state machine context: Run is now ${Status.SUCCESS}`,
          {
            result: Result.fromString(Status.SUCCESS),
            resultPath: `$.runStatus.run.status`,
          }
        )
      )
      .next(createUpdateDbStatusTask())
      .next(new Succeed(this, 'Pipeline succeeded')); // Terminal state

    // Pipeline failure tasks
    const tasksOnPipelineFailure = createNotificationState(
      `Notify: Pipeline failed`,
      {
        stageStatus: Status.FAILURE,
        runStatus: JsonPath.objectAt(`$.runStatus`),
      }
    )
      .next(
        new Pass(
          this,
          `Update state machine context: Run is now ${Status.FAILURE}`,
          {
            result: Result.fromString(Status.FAILURE),
            resultPath: `$.runStatus.run.status`,
          }
        )
      )
      .next(createUpdateDbStatusTask())
      .next(new Fail(this, `Pipeline failed`)); // Terminal state

    // Stage start tasks (no notifications)
    const tasksOnStart = (stage: StageType) => {
      return createUpdateStageStatusTask(stage, Status.IN_PROGRESS).next(
        createUpdateDbStatusTask()
      );
    };

    // Stage success tasks
    const tasksOnSuccess = (stage: StageType) => {
      return createNotificationState(`Notify: ${stage} succeeded`, {
        stageStatus: Status.SUCCESS,
        runStatus: JsonPath.objectAt(`$.runStatus`),
      })
        .next(createUpdateStageStatusTask(stage, Status.SUCCESS))
        .next(createUpdateDbStatusTask());
    };

    // Stage failure tasks
    const tasksOnFailure = (stage: StageType) => {
      return (
        createNotificationState(`Notify: ${stage} failed`, {
          stageStatus: Status.FAILURE,
          runStatus: JsonPath.objectAt(`$.runStatus`),
        })
          // Individual stage failure causes the entire pipeline to fail
          .next(createUpdateStageStatusTask(stage, Status.FAILURE))
          .next(createUpdateDbStatusTask())
          .next(tasksOnPipelineFailure)
      );
    };

    // Executor tasks to be run in ECS
    // Environment variables passed as state machine input are injected into each task
    const createEcsRunTask = (
      stage: StageType,
      taskDefinition: Ec2TaskDefinition
    ) => {
      return new EcsRunTask(this, stage, {
        integrationPattern: IntegrationPattern.RUN_JOB,
        cluster: props.ecsCluster,
        taskDefinition,
        assignPublicIp: false,
        launchTarget: new EcsEc2LaunchTarget({
          placementStrategies: [PlacementStrategy.spreadAcrossInstances()],
        }),
        resultPath: '$.lastTaskOutput',
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
      });
    };

    // Wrapper around `createEcsRunTask`; adds notifications, context, status updates
    const createStage = (
      currentStage: StageType,
      taskDefinition: Ec2TaskDefinition
    ) => {
      // Update context object
      return tasksOnStart(currentStage)
        .next(
          createEcsRunTask(currentStage, taskDefinition)
            // Add error handling
            .addCatch(tasksOnFailure(currentStage), {
              resultPath: '$.error',
            })
        )
        .next(tasksOnSuccess(currentStage));
    };

    // State machine step chaining
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
    this.stateMachine = new StateMachine(this, 'SeamlessStateMachine', {
      definition,
      timeout: Duration.minutes(60),
    });

    // Supply the public URL of the API gateway
    new CfnOutput(this, 'SeamlessStateMachineArn', {
      value: this.stateMachine.stateMachineArn,
      description: 'State machine ARN for the backend to reference',
      exportName: 'SeamlessStateMachineArn',
    });
  }
}

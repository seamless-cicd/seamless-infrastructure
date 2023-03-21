import { CustomResource, NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { CfnTaskDefinition } from 'aws-cdk-lib/aws-ecs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { ApiGatewayStack } from './api-gateway-stack';
import { FargateBackendStack } from './fargate-backend-stack';
import { StateMachineStack } from './state-machine-stack';

export interface UpdateBackendEnvVarsLambdaStackProps extends NestedStackProps {
  readonly fargateBackendStack: FargateBackendStack;
  readonly apiGatewayStack: ApiGatewayStack;
  readonly stateMachineStack: StateMachineStack;
}

export class UpdateBackendEnvVarsLambdaStack extends NestedStack {
  constructor(
    scope: Construct,
    id: string,
    props: UpdateBackendEnvVarsLambdaStackProps,
  ) {
    super(scope, id, props);

    const updateTaskDefinitionLambda = new Function(
      this,
      'UpdateBackendEnvVarsTaskDefinitionLambda',
      {
        code: Code.fromAsset('../assets/update-backend-env-vars'),
        handler: 'index.handler',
        runtime: Runtime.NODEJS_14_X,
        environment: {
          SERVICE_NAME: 'SeamlessBackendService',
          TASK_DEFINITION_FAMILY:
            props.fargateBackendStack.fargate.taskDefinition.family,
          // SECRET_ARN: secret.secretArn,
          BACKEND_URL: props.apiGatewayStack.httpApi.attrApiEndpoint,
          WEBSOCKETS_API_URL: `https${props.apiGatewayStack.websocketsApi.attrApiEndpoint.slice(
            3,
          )}/production`,
          STEP_FUNCTION_ARN:
            props.stateMachineStack.stateMachine.stateMachineArn,
        },
      },
    );

    // Retrieve the
    const taskDefinition = props.ecsBackendClusterStack.fargate.taskDefinition
      .node.defaultChild as CfnTaskDefinition;

    updateTaskDefinitionLambda.addToRolePolicy(
      new PolicyStatement({
        actions: ['ecs:DescribeTaskDefinition', 'ecs:RegisterTaskDefinition'],
        resources: ['*'],
      }),
    );

    new CustomResource(
      this,
      'UpdateBackendEnvVarsTaskDefinitionCustomResource',
      {
        serviceToken: updateTaskDefinitionLambda.functionArn,
      },
    );

    // After other resources are created, update the Backend Fargate Service Task Definition
    // const backendEnvVars = {
    //   BACKEND_URL: props.httpApi.attrApiEndpoint,
    //   WEBSOCKETS_API_URL: `https${props.websocketsApi.attrApiEndpoint.slice(
    //     3,
    //   )}/production`,
    //   STEP_FUNCTION_ARN: this.stateMachine.stateMachineArn,
    // };
    // Object.entries(backendEnvVars).forEach(([key, value]) => {
    //   props.ecsBackendClusterStack.fargate.taskDefinition.defaultContainer?.addEnvironment(
    //     key,
    //     String(value),
    //   );
    // });
  }
}

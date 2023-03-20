import { Fn, NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EcsBackendStack } from './ecs-backend-stack';

export interface EcsBackendEnvVarsStackProps extends NestedStackProps {
  readonly ecsBackendStack: EcsBackendStack;
}

export class EcsBackendEnvVarsStack extends NestedStack {
  constructor(
    scope: Construct,
    id: string,
    props?: EcsBackendEnvVarsStackProps,
  ) {
    super(scope, id, props);

    // Prop validation
    if (!props?.ecsBackendStack) {
      throw new Error('No ECS Backend Stack provided');
    }

    // Provide API Gateway URLs to Backend, as environment variables
    props.ecsBackendStack.fargate.taskDefinition.defaultContainer?.addEnvironment(
      'BACKEND_URL',
      Fn.importValue('SeamlessApiGatewayUrl'),
    );
    props.ecsBackendStack.fargate.taskDefinition.defaultContainer?.addEnvironment(
      'WEBSOCKETS_API_URL',
      Fn.importValue('SeamlessWebsocketsApiGatewayUrl'),
    );
    props.ecsBackendStack.fargate.taskDefinition.defaultContainer?.addEnvironment(
      'STEP_FUNCTION_ARN',
      Fn.importValue('SeamlessStateMachineArn'),
    );
  }
}

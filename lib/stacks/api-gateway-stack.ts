import { CfnOutput, NestedStack, NestedStackProps } from 'aws-cdk-lib';
import {
  CfnApi,
  CfnIntegration,
  CfnRoute,
  CfnStage,
  CfnVpcLink,
  CfnDeployment,
} from 'aws-cdk-lib/aws-apigatewayv2';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { Construct } from 'constructs';

export interface ApiGatewayStackProps extends NestedStackProps {
  readonly vpc: IVpc;
  readonly fargate: ApplicationLoadBalancedFargateService;
}

export class ApiGatewayStack extends NestedStack {
  readonly httpApi: CfnApi;
  readonly websocketsApi: CfnApi;

  constructor(scope: Construct, id: string, props?: ApiGatewayStackProps) {
    super(scope, id, props);

    // Prop validation
    if (!props?.vpc) {
      throw new Error('No VPC provided');
    }

    if (!props?.fargate) {
      throw new Error('No Fargate Service provided');
    }

    // CORS configuration
    const corsProperty: CfnApi.CorsProperty = {
      allowHeaders: ['*'],
      allowMethods: ['*'],
      allowOrigins: ['*'],
      maxAge: 3600,
    };

    // Define HTTP API
    this.httpApi = new CfnApi(this, 'SeamlessHttpApi', {
      name: 'HttpApiToFargate',
      protocolType: 'HTTP',
      corsConfiguration: corsProperty,
    });

    // VPC Link configuration
    const vpcLink = new CfnVpcLink(this, 'SeamlessVpcLinkToFargate', {
      name: 'SeamlessVpcLinkToFargate',
      subnetIds: props.vpc.privateSubnets.map((subnet) => subnet.subnetId),
    });

    // Target that connects the API gateway to Fargate
    const integration = new CfnIntegration(
      this,
      'SeamlessHttpApiGatewayPrivateFargateIntegration',
      {
        description: 'API Integration with private AWS Fargate Service',
        apiId: this.httpApi.attrApiId,
        integrationType: 'HTTP_PROXY',
        connectionId: vpcLink.attrVpcLinkId,
        connectionType: 'VPC_LINK',
        integrationMethod: 'ANY', // GET, POST, or ANY
        integrationUri: props.fargate.listener.listenerArn,
        payloadFormatVersion: '1.0',
      }
    );

    new CfnStage(this, 'SeamlessHttpApiStage', {
      apiId: this.httpApi.attrApiId,
      stageName: '$default',
      autoDeploy: true,
    });

    // Defines a route that accepts GET/POST to any route (/)
    new CfnRoute(this, 'SeamlessHttpRoute', {
      apiId: this.httpApi.attrApiId,
      routeKey: '$default',
      target: `integrations/${integration.ref}`,
    });

    // Defines a public /api/* route
    new CfnRoute(this, 'SeamlessPublicHttpRoute', {
      apiId: this.httpApi.attrApiId,
      routeKey: 'ANY /api',
      target: `integrations/${integration.ref}`,
    });

    // Defines a restricted /internal/* route (restrictions not applied yet)
    new CfnRoute(this, 'SeamlessInternalHttpRoute', {
      apiId: this.httpApi.attrApiId,
      routeKey: 'ANY /internal',
      target: `integrations/${integration.ref}`,
    });

    // Supply the public URL of the API gateway
    new CfnOutput(this, 'SeamlessApiGatewayUrl', {
      value: this.httpApi.attrApiEndpoint,
      description: 'API Gateway URL to access public endpoints',
      exportName: 'SeamlessApiGatewayUrl',
    });

    // Define Websockets API
    this.websocketsApi = new CfnApi(this, 'SeamlessWebsocketsApi', {
      name: 'SeamlessWebsocketsApi',
      protocolType: 'WEBSOCKET',
      routeSelectionExpression: '$request.body.action',
    });

    // Websockets integrations to HTTP API
    const connectIntegration = new CfnIntegration(
      this,
      'SeamlessWebsocketToHttpConnectIntegration',
      {
        apiId: this.websocketsApi.attrApiId,
        integrationType: 'HTTP',
        integrationMethod: 'POST',
        // Define a default template to transform the request body
        requestTemplates: {
          $default: JSON.stringify({
            connectionId: '$context.connectionId',
            statusCode: 200,
          }),
        },
        // Use the default template
        templateSelectionExpression: '\\$default',
        integrationUri:
          this.httpApi.attrApiEndpoint + '/internal/websockets/connect',
      }
    );

    const disconnectIntegration = new CfnIntegration(
      this,
      'SeamlessWebsocketToHttpDisconnectIntegration',
      {
        apiId: this.websocketsApi.attrApiId,
        integrationType: 'HTTP',
        integrationMethod: 'DELETE',
        // Define a default template to transform the request body
        requestTemplates: {
          $default: JSON.stringify({
            connectionId: '$context.connectionId',
            statusCode: 200,
          }),
        },
        // Use the default template
        templateSelectionExpression: '\\$default',
        integrationUri:
          this.httpApi.attrApiEndpoint + '/internal/websockets/disconnect',
      }
    );

    // Defines a route that listens for websocket connections
    const connectRoute = new CfnRoute(this, 'SeamlessWebsocketsConnectRoute', {
      apiId: this.websocketsApi.attrApiId,
      routeKey: '$connect',
      authorizationType: 'NONE',
      target: `integrations/${connectIntegration.ref}`,
    });

    // Defines a route that listens for websocket disconnections
    const disconnectRoute = new CfnRoute(
      this,
      'SeamlessWebsocketsDisonnectRoute',
      {
        apiId: this.websocketsApi.attrApiId,
        routeKey: '$disconnect',
        authorizationType: 'NONE',
        target: `integrations/${disconnectIntegration.ref}`,
      }
    );

    const websocketsApiDeployment = new CfnDeployment(
      this,
      `SeamlessWebsocketsApiDeployment`,
      {
        apiId: this.websocketsApi.attrApiId,
      }
    );

    new CfnStage(this, 'SeamlessWebsocketsApiStage', {
      apiId: this.websocketsApi.attrApiId,
      autoDeploy: true,
      stageName: 'production',
      deploymentId: websocketsApiDeployment.ref,
    });

    // Websockets API routes should be created before deployment
    websocketsApiDeployment.node.addDependency(connectRoute);
    websocketsApiDeployment.node.addDependency(disconnectRoute);

    // Supply the public URL of the Websockets API
    new CfnOutput(this, 'SeamlessWebsocketsApiGatewayUrl', {
      value: this.websocketsApi.attrApiEndpoint,
      description: 'Websockets API Gateway URL to access public endpoints',
      exportName: 'SeamlessWebsocketsApiGatewayUrl',
    });
  }
}

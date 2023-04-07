import { CfnOutput, NestedStack, NestedStackProps } from 'aws-cdk-lib';
import {
  CfnApi,
  CfnDeployment,
  CfnIntegration,
  CfnIntegrationResponse,
  CfnRoute,
  CfnRouteResponse,
  CfnStage,
  CfnVpcLink,
} from 'aws-cdk-lib/aws-apigatewayv2';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { ApplicationListener } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

export interface ApiGatewayStackProps extends NestedStackProps {
  readonly vpc: IVpc;
  readonly listener: ApplicationListener;
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

    if (!props?.listener) {
      throw new Error('No ALB HTTP listener provided');
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
        integrationUri: props.listener.listenerArn,
        payloadFormatVersion: '1.0',
      },
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
      },
    );

    // Connect integration - Response
    const connectIntegrationResponse = new CfnIntegrationResponse(
      this,
      'SeamlessWebsocketToHttpConnectIntegrationResponse',
      {
        apiId: this.websocketsApi.attrApiId,
        integrationId: connectIntegration.ref,
        integrationResponseKey: '$default',
      },
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
      },
    );

    const disconnectIntegrationResponse = new CfnIntegrationResponse(
      this,
      'SeamlessWebsocketToHttpDisconnectIntegrationResponse',
      {
        apiId: this.websocketsApi.attrApiId,
        integrationId: disconnectIntegration.ref,
        integrationResponseKey: '$default',
      },
    );

    // Defines a route that listens for websocket connections
    const connectRoute = new CfnRoute(this, 'SeamlessWebsocketsConnectRoute', {
      apiId: this.websocketsApi.attrApiId,
      routeKey: '$connect',
      authorizationType: 'NONE',
      target: `integrations/${connectIntegration.ref}`,
      routeResponseSelectionExpression: '$default',
    });

    // Forwards the status code 200 back to the client, to complete the connection
    const connectRouteResponse = new CfnRouteResponse(
      this,
      'SeamlessWebsocketsConnectRouteResponse',
      {
        apiId: this.websocketsApi.attrApiId,
        routeId: connectRoute.ref,
        routeResponseKey: '$default',
      },
    );

    // Defines a route that listens for websocket disconnections
    const disconnectRoute = new CfnRoute(
      this,
      'SeamlessWebsocketsDisconnectRoute',
      {
        apiId: this.websocketsApi.attrApiId,
        routeKey: '$disconnect',
        authorizationType: 'NONE',
        target: `integrations/${disconnectIntegration.ref}`,
        routeResponseSelectionExpression: '$default',
      },
    );

    const disconnectRouteResponse = new CfnRouteResponse(
      this,
      'SeamlessWebsocketsDisconnectRouteResponse',
      {
        apiId: this.websocketsApi.attrApiId,
        routeId: disconnectRoute.ref,
        routeResponseKey: '$default',
      },
    );

    const websocketsApiDeployment = new CfnDeployment(
      this,
      `SeamlessWebsocketsApiDeployment`,
      {
        apiId: this.websocketsApi.attrApiId,
      },
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

    // Supply the public URLs of the API gateways
    new CfnOutput(this, 'SeamlessApiGatewayUrl', {
      value: this.httpApi.attrApiEndpoint,
      description: 'API Gateway URL to access public endpoints',
      exportName: 'SeamlessApiGatewayUrl',
    });

    new CfnOutput(this, 'SeamlessWebsocketsApiGatewayUrl', {
      value: `https${this.websocketsApi.attrApiEndpoint.slice(3)}/production`,
      description: 'Websockets API Gateway URL to access public endpoints',
      exportName: 'SeamlessWebsocketsApiGatewayUrl',
    });
  }
}

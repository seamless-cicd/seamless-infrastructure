import { CfnOutput, NestedStack, NestedStackProps } from 'aws-cdk-lib';
import {
  CfnApi,
  CfnIntegration,
  CfnRoute,
  CfnStage,
  CfnVpcLink,
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

    // Supply the public URL of the API gateway
    new CfnOutput(this, 'SeamlessApiGatewayUrl', {
      value: this.httpApi.attrApiEndpoint,
      description: 'API Gateway URL to access public endpoints',
      exportName: 'SeamlessApiGatewayUrl',
    });
  }
}

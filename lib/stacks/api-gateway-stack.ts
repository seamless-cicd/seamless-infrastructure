import { CfnOutput, NestedStack, NestedStackProps } from 'aws-cdk-lib';
import {
  CfnApi,
  CfnIntegration,
  CfnRoute,
  CfnStage,
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

    // CORS configuration
    // const corsProperty: CfnApi.CorsProperty = {
    //   allowCredentials: true,
    //   allowHeaders: ['*'],
    //   allowMethods: ['*'],
    //   allowOrigins: ['*'],
    //   maxAge: 3600,
    // };

    // Define HTTP API
    this.httpApi = new CfnApi(this, 'SeamlessHttpApi', {
      name: 'HttpApiToFargate',
      protocolType: 'HTTP',
      // corsConfiguration: corsProperty,
    });

    // Target that connects the API gateway to Fargate
    const integration = new CfnIntegration(
      this,
      'SeamlessHttpApiGatewayIntegration',
      {
        apiId: this.httpApi.attrApiId,
        description: 'API Integration with AWS Fargate Service',
        integrationMethod: 'ANY', // GET, POST, or ANY
        integrationType: 'HTTP_PROXY',
        integrationUri:
          'http://' + props.fargate.listener.loadBalancer.loadBalancerDnsName,
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
    new CfnOutput(this, 'SeamlessAPIGatewayUrl', {
      description: 'API Gateway URL to access public endpoints',
      value: this.httpApi.attrApiEndpoint,
    });
  }
}

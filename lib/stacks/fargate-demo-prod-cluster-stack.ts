import { NestedStack, NestedStackProps, Tag } from 'aws-cdk-lib';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { Cluster } from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';

import { config } from 'dotenv';
config();

export interface DemoProdClusterStackProps extends NestedStackProps {
  readonly vpc: IVpc;
}

export class DemoProdClusterStack extends NestedStack {
  readonly cluster: Cluster;

  constructor(scope: Construct, id: string, props: DemoProdClusterStackProps) {
    super(scope, id, props);

    // Prop validation
    if (!props?.vpc) {
      throw new Error('No VPC provided');
    }

    // Create Fargate cluster with Cloud Map namespace
    this.cluster = new Cluster(this, 'SeamlessDemoProdCluster', {
      clusterName: 'SeamlessDemoProdCluster',
      vpc: props.vpc,
      containerInsights: true,
      defaultCloudMapNamespace: {
        name: 'seamless-demo-prod',
      },
    });
  }
}

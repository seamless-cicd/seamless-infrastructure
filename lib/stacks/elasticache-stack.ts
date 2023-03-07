import { NestedStack, NestedStackProps, CfnOutput } from 'aws-cdk-lib';
import { IVpc, CfnSecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { CfnCacheCluster, CfnSubnetGroup } from 'aws-cdk-lib/aws-elasticache';
import { Construct } from 'constructs';

export interface ElastiCacheStackProps extends NestedStackProps {
  readonly vpc: IVpc;
}

export class ElastiCacheStack extends NestedStack {
  readonly elastiCacheCluster: CfnCacheCluster;
  readonly elastiCacheSecurityGroup: CfnSecurityGroup;
  readonly elastiCacheSubnetGroup: CfnSubnetGroup;

  constructor(scope: Construct, id: string, props?: ElastiCacheStackProps) {
    super(scope, id, props);

    if (!props?.vpc) {
      throw new Error('VPC not found');
    }

    // Create subnet group for cluster
    this.elastiCacheSubnetGroup = new CfnSubnetGroup(
      this,
      'SeamlessElastiCacheSubnetGroup',
      {
        description: 'Subnet group for ElastiCache cluster',
        subnetIds: props.vpc.publicSubnets.map((subnet) => subnet.subnetId),
      }
    );
    console.log(this.elastiCacheSubnetGroup);

    // Create a new security group for the ElastiCache instance
    // Allow all inbound traffic from subnet group, and all outbound from cluster
    this.elastiCacheSecurityGroup = new CfnSecurityGroup(
      this,
      'SeamlessElastiCacheSecurityGroup',
      {
        vpcId: props.vpc.vpcId,
        groupDescription: 'Security group for Seamless ElastiCache cluster',
      }
    );
    console.log(this.elastiCacheSecurityGroup);

    // ElastiCache instance
    this.elastiCacheCluster = new CfnCacheCluster(
      this,
      'SeamlessElastiCacheCluster',
      {
        clusterName: 'seamless-elasticache',
        cacheNodeType: 'cache.t2.micro',
        engine: 'redis',
        numCacheNodes: 1,
        cacheSubnetGroupName: this.elastiCacheSubnetGroup.ref,
        vpcSecurityGroupIds: [this.elastiCacheSecurityGroup.ref],
      }
    );
    console.log(this.elastiCacheCluster);

    // Output the endpoint URL for the ElastiCache instance
    new CfnOutput(this, 'ElastiCacheEndpoint', {
      value: this.elastiCacheCluster.attrRedisEndpointAddress,
    });
  }
}

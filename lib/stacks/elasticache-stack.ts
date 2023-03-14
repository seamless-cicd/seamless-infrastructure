import {
  NestedStack,
  NestedStackProps,
  CfnOutput,
  Aspects,
  Tag,
} from 'aws-cdk-lib';
import { IVpc, SecurityGroup, Peer, Port } from 'aws-cdk-lib/aws-ec2';
import { CfnCacheCluster, CfnSubnetGroup } from 'aws-cdk-lib/aws-elasticache';
import { Construct } from 'constructs';

export interface ElastiCacheStackProps extends NestedStackProps {
  readonly vpc: IVpc;
}

export class ElastiCacheStack extends NestedStack {
  readonly elastiCacheCluster: CfnCacheCluster;
  readonly elastiCacheSecurityGroup: SecurityGroup;
  readonly elastiCacheSubnetGroup: CfnSubnetGroup;

  constructor(scope: Construct, id: string, props?: ElastiCacheStackProps) {
    super(scope, id, props);

    if (!props?.vpc) {
      throw new Error('VPC not found');
    }

    // Create a private subnet group
    this.elastiCacheSubnetGroup = new CfnSubnetGroup(
      this,
      'SeamlessElastiCacheSubnetGroup',
      {
        description: 'Subnet group for ElastiCache cluster',
        subnetIds: props.vpc.privateSubnets.map((subnet) => subnet.subnetId),
      }
    );

    // Create a new security group for the ElastiCache instance
    // Allow all inbound traffic from subnet group, and all outbound from cluster
    this.elastiCacheSecurityGroup = new SecurityGroup(
      this,
      'SeamlessElastiCacheSecurityGroup',
      {
        vpc: props.vpc,
        description: 'Security group for Seamless ElastiCache cluster',
      }
    );

    Aspects.of(this.elastiCacheSecurityGroup).add(
      new Tag('Name', 'SeamlessElastiCache')
    );

    // Default Redis port
    this.elastiCacheSecurityGroup.addIngressRule(
      Peer.anyIpv4(),
      Port.tcp(6379),
      'Allow inbound traffic on 6379'
    );

    // ElastiCache instance
    this.elastiCacheCluster = new CfnCacheCluster(
      this,
      'SeamlessElastiCacheCluster',
      {
        clusterName: 'SeamlessElastiCache',
        cacheNodeType: 'cache.t2.micro',
        engine: 'redis',
        numCacheNodes: 1,
        cacheSubnetGroupName: this.elastiCacheSubnetGroup.ref,
        vpcSecurityGroupIds: [this.elastiCacheSecurityGroup.securityGroupId],
      }
    );

    // Output the endpoint URL for the ElastiCache instance
    new CfnOutput(this, 'ElastiCacheEndpoint', {
      value: this.elastiCacheCluster.attrRedisEndpointAddress,
    });
  }
}

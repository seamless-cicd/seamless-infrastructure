import { NestedStack, NestedStackProps, RemovalPolicy } from 'aws-cdk-lib';
import { IVpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import {
  FileSystem,
  LifecyclePolicy,
  PerformanceMode,
  ThroughputMode,
  OutOfInfrequentAccessPolicy,
} from 'aws-cdk-lib/aws-efs';
import { Construct } from 'constructs';

interface EfsStackProps extends NestedStackProps {
  readonly vpc: IVpc;
}

export class EfsStack extends NestedStack {
  readonly efs: FileSystem;

  constructor(scope: Construct, id: string, props: EfsStackProps) {
    super(scope, id, props);

    // Prop validation
    if (!props.vpc) {
      throw new Error('No VPC provided');
    }

    // Create file system to serve as shared Docker volume
    this.efs = new FileSystem(this, 'SeamlessEfs', {
      vpc: props.vpc,
      enableAutomaticBackups: true,
      encrypted: true,
      performanceMode: PerformanceMode.GENERAL_PURPOSE,
      throughputMode: ThroughputMode.BURSTING,
      lifecyclePolicy: LifecyclePolicy.AFTER_14_DAYS,
      outOfInfrequentAccessPolicy: OutOfInfrequentAccessPolicy.AFTER_1_ACCESS,
      removalPolicy: RemovalPolicy.DESTROY,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    this.efs.connections.allowDefaultPortFromAnyIpv4('Allow NFS');
  }
}

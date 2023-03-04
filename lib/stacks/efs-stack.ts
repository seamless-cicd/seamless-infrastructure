import { Construct } from 'constructs';
import { NestedStack, NestedStackProps, RemovalPolicy } from 'aws-cdk-lib';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import {
  FileSystem,
  LifecyclePolicy,
  PerformanceMode,
  ThroughputMode,
  OutOfInfrequentAccessPolicy,
} from 'aws-cdk-lib/aws-efs';

interface EfsStackProps extends NestedStackProps {
  vpc: IVpc;
}

export class EfsStack extends NestedStack {
  public readonly efs: FileSystem;

  constructor(scope: Construct, id: string, props: EfsStackProps) {
    super(scope, id, props);

    // Prop validation
    if (!props.vpc) {
      throw new Error('No VPC provided');
    }

    // Create file system to serve as shared Docker volume
    this.efs = new FileSystem(this, 'seamless-efs', {
      vpc: props.vpc,
      fileSystemName: 'SeamlessEFS',
      enableAutomaticBackups: true,
      encrypted: true,
      performanceMode: PerformanceMode.GENERAL_PURPOSE,
      throughputMode: ThroughputMode.BURSTING,
      lifecyclePolicy: LifecyclePolicy.AFTER_14_DAYS,
      outOfInfrequentAccessPolicy: OutOfInfrequentAccessPolicy.AFTER_1_ACCESS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.efs.connections.allowDefaultPortFromAnyIpv4('Allow NFS');
  }
}

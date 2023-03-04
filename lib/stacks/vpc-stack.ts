import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { Vpc, IVpc, IpAddresses, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class VpcStack extends NestedStack {
  readonly vpc: IVpc;

  constructor(scope: Construct, id: string, props?: NestedStackProps) {
    super(scope, id, props);

    this.vpc = new Vpc(this, 'SeamlessVpc', {
      ipAddresses: IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'publicSubnet',
          subnetType: SubnetType.PUBLIC,
        },
      ],
    });
  }
}

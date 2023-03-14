import { NestedStack, NestedStackProps, Aspects, Tag } from 'aws-cdk-lib';
import { Vpc, IVpc, IpAddresses, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class VpcStack extends NestedStack {
  readonly vpc: IVpc;

  constructor(scope: Construct, id: string, props?: NestedStackProps) {
    super(scope, id, props);

    // Create the VPC with two subnets (public and private)
    this.vpc = new Vpc(this, 'SeamlessVpc', {
      ipAddresses: IpAddresses.cidr('10.0.0.0/16'),
      natGateways: 1,
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: 'SeamlessPublicSubnet',
          subnetType: SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'SeamlesPrivateSubnet',
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
    });

    // Update naming for readability
    Aspects.of(this.vpc).add(new Tag('Name', 'SeamlessVpc'));

    for (const subnet of this.vpc.publicSubnets) {
      Aspects.of(subnet).add(
        new Tag(
          'Name',
          `${this.vpc.node.id}-${subnet.node.id.replace(/Subnet[0-9]$/, '')}-${
            subnet.availabilityZone
          }`
        )
      );
    }

    for (const subnet of this.vpc.privateSubnets) {
      Aspects.of(subnet).add(
        new Tag(
          'Name',
          `${this.vpc.node.id}-${subnet.node.id.replace(/Subnet[0-9]$/, '')}-${
            subnet.availabilityZone
          }`
        )
      );
    }
  }
}

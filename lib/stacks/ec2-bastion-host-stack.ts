// import * as path from 'path';
import { Aspects, NestedStack, NestedStackProps, Tag } from 'aws-cdk-lib';
import {
  AmazonLinuxCpuType,
  AmazonLinuxGeneration,
  AmazonLinuxImage,
  BlockDeviceVolume,
  CfnKeyPair,
  Instance,
  InstanceClass,
  InstanceSize,
  InstanceType,
  IVpc,
  Peer,
  Port,
  SecurityGroup,
  SubnetType,
} from 'aws-cdk-lib/aws-ec2';
// import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { ManagedPolicy, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

import { config } from 'dotenv';
config();

// Bastion host is located in a public subnet and enables access to resources in private subnets
export interface Ec2BastionHostStackProps extends NestedStackProps {
  readonly vpc: IVpc;
}

export class Ec2BastionHostStack extends NestedStack {
  readonly ec2BastionHost: Instance;
  // readonly ec2InstanceInitScriptPath: string;
  // readonly ec2InstanceInitScriptS3Asset: Asset;
  readonly ec2BastionHostIamRole: Role;
  readonly ec2BastionHostSecurityGroup: SecurityGroup;

  constructor(scope: Construct, id: string, props?: Ec2BastionHostStackProps) {
    super(scope, id, props);

    if (!props?.vpc) {
      throw new Error('VPC not found');
    }

    // Create security group
    this.ec2BastionHostSecurityGroup = new SecurityGroup(
      this,
      'SeamlessEc2BastionHostSecurityGroup',
      {
        vpc: props.vpc,
        description: 'EC2 bastion host instance security group',
        allowAllOutbound: true,
      },
    );

    Aspects.of(this.ec2BastionHostSecurityGroup).add(
      new Tag('Name', 'SeamlessEc2BastionHostSecurityGroup'),
    );

    this.ec2BastionHostSecurityGroup.addIngressRule(
      Peer.anyIpv4(),
      Port.tcp(22),
      'Allow SSH access',
    );

    // Create IAM Role
    this.ec2BastionHostIamRole = new Role(this, 'SeamlessEc2BastionHostRole', {
      assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
      inlinePolicies: {},
    });

    // Create a new key pair for SSH
    // Retrieve from AWS Systems Manage > Parameter Store
    // https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/create-key-pairs.html#create-key-pair-cloudformation
    const keyPair = new CfnKeyPair(this, 'SeamlessBastionHostKeyPair', {
      keyName: 'SeamlessBastionHostKeypair',
    });

    // Create a new EC2 instance with 10GB EBS volume
    this.ec2BastionHost = new Instance(this, 'SeamlessEc2BastionHost', {
      vpc: props.vpc,
      vpcSubnets: { subnetType: SubnetType.PUBLIC },
      securityGroup: this.ec2BastionHostSecurityGroup,
      role: this.ec2BastionHostIamRole,
      keyName: keyPair.keyName,
      instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.MICRO),
      machineImage: new AmazonLinuxImage({
        generation: AmazonLinuxGeneration.AMAZON_LINUX_2,
        cpuType: AmazonLinuxCpuType.X86_64,
      }),
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: BlockDeviceVolume.ebs(10),
        },
      ],
      userDataCausesReplacement: true,
    });

    Aspects.of(this.ec2BastionHost).add(
      new Tag('Name', 'SeamlessEc2BastionHost'),
    );

    // Upload initialization script to S3 and execute
    // this.ec2InstanceInitScriptS3Asset = new Asset(
    //   this,
    //   'SeamlessEc2InstanceInitScript',
    //   {
    //     path: path.join(__dirname, '../lib/scripts/initial-setup.sh'),
    //   }
    // );

    // this.ec2InstanceInitScriptPath =
    //   this.ec2Instance.userData.addS3DownloadCommand({
    //     bucket: this.ec2InstanceInitScriptS3Asset.bucket,
    //     bucketKey: this.ec2InstanceInitScriptS3Asset.s3ObjectKey,
    //   });

    // const initScriptWrapper = `sudo -i -u ec2-user bash ${this.ec2InstanceInitScriptPath}`;
    // this.ec2Instance.userData.addCommands(initScriptWrapper);
    // this.ec2InstanceInitScriptS3Asset.grantRead(this.ec2Instance.role);
  }
}

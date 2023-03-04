import * as path from 'path';
import { NestedStack, NestedStackProps, Tags } from 'aws-cdk-lib';
import {
  Vpc,
  IVpc,
  Instance,
  InstanceType,
  InstanceClass,
  InstanceSize,
  AmazonLinuxImage,
  AmazonLinuxGeneration,
  AmazonLinuxCpuType,
  BlockDeviceVolume,
  SecurityGroup,
  CfnKeyPair,
  Peer,
  Port,
  SubnetType,
} from 'aws-cdk-lib/aws-ec2';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { Role, ServicePrincipal, ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

import { config } from 'dotenv';
config();

export interface EC2InstanceStackProps extends NestedStackProps {
  readonly vpc: IVpc;
}

export class EC2InstanceStack extends NestedStack {
  readonly vpc: Vpc;
  readonly ec2Instance: Instance;
  readonly ec2InstanceInitScriptPath: string;
  readonly ec2InstanceInitScriptS3Asset: Asset;
  readonly ec2InstanceIAMRole: Role;
  readonly ec2InstanceSecurityGroup: SecurityGroup;

  constructor(scope: Construct, id: string, props?: EC2InstanceStackProps) {
    super(scope, id, props);

    // Create security group
    this.ec2InstanceSecurityGroup = new SecurityGroup(
      this,
      'SeamlessEc2InstanceSecurityGroup',
      {
        vpc: this.vpc,
        securityGroupName: 'seeamless-ec2-instance-security-group',
        description: 'EC2 instance security group',
        allowAllOutbound: true,
      }
    );

    Tags.of(this.ec2InstanceSecurityGroup).add(
      'Name',
      'ec2-instance-security-group'
    );

    this.ec2InstanceSecurityGroup.addIngressRule(
      Peer.anyIpv4(),
      Port.tcp(22),
      'allow SSH access'
    );

    // Create IAM Role
    this.ec2InstanceIAMRole = new Role(this, 'SeamlessEc2InstanceRole', {
      roleName: 'ec2-instance-role',
      assumedBy: new ServicePrincipal('amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
      inlinePolicies: {},
    });

    // Create a new key pair, to be used for SSH
    const key = new CfnKeyPair(this, 'MyKeyPair', {
      keyName: 'seamless-keypair',
    });

    // Create a new EC2 instance with 10GB EBS volume
    this.ec2Instance = new Instance(this, 'SeamlessEc2Instance', {
      vpc: this.vpc,
      vpcSubnets: { subnetType: SubnetType.PUBLIC },
      securityGroup: this.ec2InstanceSecurityGroup,
      role: this.ec2InstanceIAMRole,
      keyName: key.keyName,
      instanceName: 'ec2-instance',
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

    // Upload initialization script to S3 and execute
    this.ec2InstanceInitScriptS3Asset = new Asset(
      this,
      'Ec2InstanceInitScript',
      {
        path: path.join(__dirname, '../lib/scripts/initial-setup.sh'),
      }
    );

    this.ec2InstanceInitScriptPath =
      this.ec2Instance.userData.addS3DownloadCommand({
        bucket: this.ec2InstanceInitScriptS3Asset.bucket,
        bucketKey: this.ec2InstanceInitScriptS3Asset.s3ObjectKey,
      });

    const initScriptWrapper = `sudo -i -u ec2-user bash ${this.ec2InstanceInitScriptPath}`;
    this.ec2Instance.userData.addCommands(initScriptWrapper);
    this.ec2InstanceInitScriptS3Asset.grantRead(this.ec2Instance.role);
  }
}

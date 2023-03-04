import { config } from 'dotenv';
config();

import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3Assets from 'aws-cdk-lib/aws-s3-assets';
import * as iam from 'aws-cdk-lib/aws-iam';

import { Construct } from 'constructs';

export interface EC2InstanceStackProps extends cdk.NestedStackProps {
  vpc: ec2.Vpc;
}

export class EC2InstanceStack extends cdk.NestedStack {
  vpc: ec2.Vpc;
  ec2Instance: ec2.Instance;
  ec2InstanceInitScriptPath: string;
  ec2InstanceInitScriptS3Asset: s3Assets.Asset;
  ec2InstanceIAMRole: iam.Role;
  ec2InstanceSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props?: EC2InstanceStackProps) {
    super(scope, id, props);

    // Create security group
    this.ec2InstanceSecurityGroup = new ec2.SecurityGroup(
      this,
      'seamless-ec2-instance-security-group',
      {
        vpc: this.vpc,
        securityGroupName: 'seeamless-ec2-instance-security-group',
        description: 'EC2 instance security group',
        allowAllOutbound: true,
      }
    );

    cdk.Tags.of(this.ec2InstanceSecurityGroup).add(
      'Name',
      'ec2-instance-security-group'
    );

    this.ec2InstanceSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'allow SSH access'
    );

    // Create IAM Role
    this.ec2InstanceIAMRole = new iam.Role(this, 'seamless-ec2-instance-role', {
      roleName: 'ec2-instance-role',
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'AmazonSSMManagedInstanceCore'
        ),
      ],
      inlinePolicies: {},
    });

    // Create a new key pair, to be used for SSH
    const key = new ec2.CfnKeyPair(this, 'MyKeyPair', {
      keyName: 'seamless-keypair',
    });

    // Create a new EC2 instance with 10GB EBS volume
    this.ec2Instance = new ec2.Instance(this, 'seamless-ec2-instance', {
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: this.ec2InstanceSecurityGroup,
      role: this.ec2InstanceIAMRole,
      keyName: key.keyName,
      instanceName: 'ec2-instance',
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
        cpuType: ec2.AmazonLinuxCpuType.X86_64,
      }),
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(10),
        },
      ],
      userDataCausesReplacement: true,
    });

    // Upload initialization script to S3 and execute
    this.ec2InstanceInitScriptS3Asset = new s3Assets.Asset(
      this,
      'ec2-instance-init-script',
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

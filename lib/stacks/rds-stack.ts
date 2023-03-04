import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as secretsManager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface RdsStackProps extends cdk.NestedStackProps {
  vpc: ec2.Vpc;
}

export class RdsStack extends cdk.NestedStack {
  rdsInstance: rds.DatabaseInstance;
  rdsCredentialsSecret: secretsManager.Secret;
  rdsSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props?: RdsStackProps) {
    super(scope, id, props);

    if (!props?.vpc) {
      throw new Error('VPC not found');
    }

    this.rdsSecurityGroup = new ec2.SecurityGroup(
      this,
      'seamlessRdsSecurityGroup',
      {
        vpc: props.vpc,
        description: 'Security group for Seamless RDS',
      }
    );

    this.rdsSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5432),
      'Allow inbound traffic on 5432'
    );

    // Credentials secret
    this.rdsCredentialsSecret = new secretsManager.Secret(
      this,
      'seamlessRdsCredentialsSecret',
      {
        secretName: `seamlessRdsCredentialsSecret`,
        generateSecretString: {
          secretStringTemplate: JSON.stringify({
            username: 'postgres',
          }),
          excludePunctuation: true,
          includeSpace: false,
          generateStringKey: 'password',
        },
      }
    );

    new ssm.StringParameter(this, 'rdsCredentialsSecretArn', {
      parameterName: `rdsCredentialsSecretArn`,
      stringValue: this.rdsCredentialsSecret.secretArn,
    });

    // RDS database instance
    this.rdsInstance = new rds.DatabaseInstance(this, 'seamlessRds', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_14,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE3,
        ec2.InstanceSize.MICRO
      ),
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      databaseName: 'seamlessRds',
      securityGroups: [this.rdsSecurityGroup],
      credentials: rds.Credentials.fromSecret(this.rdsCredentialsSecret),
      maxAllocatedStorage: 128,
      deletionProtection: false,
      storageEncrypted: true,
      allowMajorVersionUpgrade: false,
      autoMinorVersionUpgrade: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      publiclyAccessible: true,
    });
  }
}

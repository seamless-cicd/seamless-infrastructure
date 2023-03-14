import {
  NestedStack,
  NestedStackProps,
  RemovalPolicy,
  Aspects,
  Tag,
} from 'aws-cdk-lib';
import {
  IVpc,
  SecurityGroup,
  Peer,
  Port,
  SubnetType,
  InstanceClass,
  InstanceSize,
  InstanceType,
} from 'aws-cdk-lib/aws-ec2';
import {
  DatabaseInstance,
  DatabaseInstanceEngine,
  PostgresEngineVersion,
  Credentials,
} from 'aws-cdk-lib/aws-rds';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface RdsStackProps extends NestedStackProps {
  readonly vpc: IVpc;
}

export class RdsStack extends NestedStack {
  readonly rdsInstance: DatabaseInstance;
  readonly rdsCredentialsSecret: Secret;
  readonly rdsSecurityGroup: SecurityGroup;

  constructor(scope: Construct, id: string, props?: RdsStackProps) {
    super(scope, id, props);

    if (!props?.vpc) {
      throw new Error('VPC not found');
    }

    this.rdsSecurityGroup = new SecurityGroup(
      this,
      'SeamlessRdsSecurityGroup',
      {
        vpc: props.vpc,
        description: 'Security group for Seamless RDS',
      }
    );

    Aspects.of(this.rdsSecurityGroup).add(new Tag('Name', 'SeamlessRds'));

    this.rdsSecurityGroup.addIngressRule(
      Peer.anyIpv4(),
      Port.tcp(5432),
      'Allow inbound traffic on 5432'
    );

    // Credentials secret
    this.rdsCredentialsSecret = new Secret(
      this,
      'SeamlessRdsCredentialsSecret',
      {
        secretName: `SeamlessRdsCredentialsSecret`,
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

    new StringParameter(this, 'RdsCredentialsSecretArn', {
      parameterName: `RdsCredentialsSecretArn`,
      stringValue: this.rdsCredentialsSecret.secretArn,
    });

    // RDS database instance
    this.rdsInstance = new DatabaseInstance(this, 'SeamlessRds', {
      engine: DatabaseInstanceEngine.postgres({
        version: PostgresEngineVersion.VER_14,
      }),
      instanceType: InstanceType.of(
        InstanceClass.BURSTABLE3,
        InstanceSize.MICRO
      ),
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      },
      databaseName: 'seamless_rds',
      securityGroups: [this.rdsSecurityGroup],
      credentials: Credentials.fromSecret(this.rdsCredentialsSecret),
      maxAllocatedStorage: 128,
      deletionProtection: true,
      storageEncrypted: true,
      allowMajorVersionUpgrade: false,
      autoMinorVersionUpgrade: false,
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }
}

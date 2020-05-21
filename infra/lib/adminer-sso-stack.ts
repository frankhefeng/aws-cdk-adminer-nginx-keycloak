import * as cdk from '@aws-cdk/core';
import acm = require('@aws-cdk/aws-certificatemanager');
import ec2 = require('@aws-cdk/aws-ec2');
import ecr = require('@aws-cdk/aws-ecr');
import ecs = require('@aws-cdk/aws-ecs');
import elbv2 = require("@aws-cdk/aws-elasticloadbalancingv2");
import logs = require('@aws-cdk/aws-logs');
import route53 = require('@aws-cdk/aws-route53');

export interface AdminerSsoStackProps extends cdk.StackProps {
  cidr: string;
  maxAzs: number;
  ecrRepoName: string,
  domainName: string,
  adminerSubDomainName: string,
  vouchSubDomainName: string,
  acmARN: string,
}

export class AdminerSsoStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: AdminerSsoStackProps) {
    super(scope, id, props);

    const stackPrefix = 'AdminerSso';

    const natGatewayProvider = ec2.NatProvider.instance({
      instanceType: new ec2.InstanceType('t3.micro')
    });
    var vpc = new ec2.Vpc(this, 'vpc', {
      maxAzs: props.maxAzs,
      cidr: props.cidr,
      natGatewayProvider,
      natGateways: props.maxAzs,
    })
    const cluster = new ecs.Cluster(this, 'cluster', {
      vpc: vpc
    })

    const ecrRepo = ecr.Repository.fromRepositoryName(this, 'ecrRepo', props.ecrRepoName)

    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: props.domainName
    });

    const cert = acm.Certificate.fromCertificateArn(this, 'AdminerCert', props.acmARN);

    //Adminer
    const adminerLoadBalancer = new elbv2.NetworkLoadBalancer(this, 'AdminerLoadBalancer', {
      vpc: vpc,
    });
    const adminerTaskDefinition = new ecs.FargateTaskDefinition(this, 'AdminerTaskDef', {});
    const adminerLogDriver = new ecs.AwsLogDriver({
      streamPrefix: this.node.id + 'Adminer',
      logGroup: new logs.LogGroup(this, 'AdminerLogGroup', {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      })
    });
    const adminerContainer = adminerTaskDefinition.addContainer('AdminerContainer', {
      image: ecs.ContainerImage.fromRegistry('adminer:fastcgi'),
      logging: adminerLogDriver,
    });
    adminerContainer.addPortMappings({ containerPort: 9000 });
    const adminerFargateService = new ecs.FargateService(this, 'AdminerService', {
      cluster: cluster,
      taskDefinition: adminerTaskDefinition,
    });
    adminerFargateService.connections.allowFromAnyIpv4(ec2.Port.allTcp());
    adminerFargateService.autoScaleTaskCount({ minCapacity: 2, maxCapacity: 5 });
    const adminerListener = adminerLoadBalancer.addListener('AdminerListener', {
      port: 9000,
    });
    adminerListener.addTargets('AdminerTarget', {
      port: 9000,
      healthCheck: {
        protocol: elbv2.Protocol.TCP
      }
    }).addTarget(adminerFargateService);

    //vouch-proxy
    const vouchLoadBalancer = new elbv2.ApplicationLoadBalancer(this, 'VouchLoadBalancer', {
      vpc: vpc,
      internetFacing: true,
    });
    const vouchTaskDefinition = new ecs.FargateTaskDefinition(this, 'VouchTaskDef', {});
    const vouchLogDriver = new ecs.AwsLogDriver({
      streamPrefix: this.node.id + 'Vouch',
      logGroup: new logs.LogGroup(this, 'VouchLogGroup', {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      })
    });
    const vouchContainer = vouchTaskDefinition.addContainer('VouchContainer', {
      image: ecs.ContainerImage.fromAsset('../app/vouch'),
      logging: vouchLogDriver,
    });
    vouchContainer.addPortMappings({ containerPort: 9090 });
    const vouchFargateService = new ecs.FargateService(this, 'VouchService', {
      cluster: cluster,
      taskDefinition: vouchTaskDefinition,
    });
    vouchFargateService.connections.allowFromAnyIpv4(ec2.Port.allTcp());
    vouchFargateService.autoScaleTaskCount({ minCapacity: 2, maxCapacity: 5 });
    const vouchListener = vouchLoadBalancer.addListener('VouchListener', {
      protocol: elbv2.ApplicationProtocol.HTTPS,
      port: 443,
      certificates: [cert],
      open: true,
    });
    vouchListener.addTargets('VouchTarget', {
      port: 9090,
      protocol: elbv2.ApplicationProtocol.HTTP,
      healthCheck: {
        path: '/healthcheck'
      },
    }).addTarget(vouchFargateService);

    //Nginx
    const nginxLoadBalancer = new elbv2.ApplicationLoadBalancer(this, 'NginxLb', {
      vpc: vpc,
      internetFacing: true,
    });
    const nginxListener = nginxLoadBalancer.addListener('NginxListener', {
      protocol: elbv2.ApplicationProtocol.HTTPS,
      port: 443,
      certificates: [cert],
      open: true,
    });
    const nginxTaskDefinition = new ecs.FargateTaskDefinition(this, 'NginxTaskDef', {});
    const nginxLogDriver = new ecs.AwsLogDriver({
      streamPrefix: this.node.id + 'Nginx',
      logGroup: new logs.LogGroup(this, 'NginxLogGroup', {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      })
    });
    const container = nginxTaskDefinition.addContainer('NginxContainer', {
      image: ecs.ContainerImage.fromAsset('../app/nginx'),
      logging: nginxLogDriver,
      entryPoint: ["/bin/bash", "/opt/command.sh"],
      environment: {
        'ADMINER_HOST': adminerLoadBalancer.loadBalancerDnsName,
        'VOUCH_HOST': props.vouchSubDomainName + '.' + props.domainName,
      }
    });
    container.addPortMappings({ containerPort: 80 });
    const nginxFargateService = new ecs.FargateService(this, 'NginxService', {
      cluster: cluster,
      taskDefinition: nginxTaskDefinition
    });
    nginxFargateService.autoScaleTaskCount({ minCapacity: 2, maxCapacity: 5 });
    nginxListener.addTargets('NginxTarget', {
      port: 80,
      healthCheck: {
        path: '/health'
      },
    }).addTarget(nginxFargateService);

    new route53.CnameRecord(this, 'nginxCname', {
      zone: hostedZone,
      recordName: props.adminerSubDomainName,
      domainName: nginxLoadBalancer.loadBalancerDnsName
    });
    new route53.CnameRecord(this, 'vouchCname', {
      zone: hostedZone,
      recordName: props.vouchSubDomainName,
      domainName: vouchLoadBalancer.loadBalancerDnsName
    });
  }
}

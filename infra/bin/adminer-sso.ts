#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { AdminerSsoStack } from '../lib/adminer-sso-stack';

if (!process.env.domainName) {
    console.error("please define domainName and acmARN envionment variables!! \nRUN:")
    console.error("domainName=mydomain.com acmARN=xxx cdk deploy \nOR \ndomainName=mydomain.com subDomainName=adminer acmARN=xxx cdk deploy ")
    process.exit(1)
}

const app = new cdk.App();
new AdminerSsoStack(app, 'AdminerSsoStack', {
    cidr: '10.10.0.0/16',
    maxAzs: 2,
    ecrRepoName: 'adminer',
    domainName: process.env.domainName!,
    adminerSubDomainName: process.env.adminerSubDomainName || 'adminer',
    vouchSubDomainName: process.env.vouchSubDomainName || 'login',
    acmARN: process.env.acmARN!,
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    },
});

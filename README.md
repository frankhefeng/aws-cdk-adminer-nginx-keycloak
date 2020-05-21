# AWS CDK implementation of Adminer with SSO (OpenID Connect)
This project deploys [Adminer](https://www.adminer.org/) on Amazon Fargate protected by OpenID Connect (OIDC) SSO

## How to use
1. Have a domain hosted in Route53, also a wildcard SSL/TLS certificate for this domain created in ACM.
2. [Optional] Deploy [KeyCloak](https://www.keycloak.org/) to setup SSO. Please refer to  [aws-cdk-fargate-keycloak](https://github.com/frankhefeng/aws-cdk-fargate-keycloak)
3. Have OIDC Endpoint information ready, and update `vouch/config.yml` accordingly.  Especially these items:
    - yourdomain.com
    - session.key
    - oauth.client_id
    - oauth.client_secret
    - oauth.auth_url
    - oauth.token_url
    - oauth.user_info_url
    - oauth.callback_url

## Deploy
`domainName=yourdomain.com adminerSubDomainName=adminer vouchSubDomainName=login acmARN=... cdk deploy`

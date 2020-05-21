#!/usr/bin/env bash
envsubst '$$ADMINER_HOST $$VOUCH_HOST' < /etc/nginx/conf.d/nginx.conf.template > /etc/nginx/conf.d/nginx.conf && nginx -g 'daemon off;'

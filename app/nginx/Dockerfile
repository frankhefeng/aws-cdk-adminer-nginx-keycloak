FROM nginx

RUN apt-get -y update && apt-get install -y curl
HEALTHCHECK --interval=1m --timeout=3s CMD curl --fail http://localhost/health || exit 1

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf.template /etc/nginx/conf.d/nginx.conf.template
COPY command.sh /opt/command.sh

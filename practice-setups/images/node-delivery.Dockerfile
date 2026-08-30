# syntax=docker/dockerfile:1

FROM node:24.20.0-bookworm-slim

ENV NODE_ENV=production \
    NODE_PATH=/opt/lab/node_modules
WORKDIR /opt/lab

RUN --mount=type=bind,from=task,source=.,target=/task \
    cp /task/package.json ./ \
    && npm install --omit=dev --ignore-scripts --no-audit --no-fund --no-package-lock
COPY bases/common/lab-init-entrypoint.sh /usr/local/bin/lab-entrypoint.sh
COPY --from=task scaffold/ /lab/scaffold/
RUN --mount=type=bind,from=task,source=.,target=/task \
    mkdir -p /lab/image \
    && if [ -d /task/image ]; then cp -R /task/image/. /lab/image/; fi
RUN chmod +x /usr/local/bin/lab-entrypoint.sh
ENTRYPOINT ["lab-entrypoint.sh"]
CMD ["bash"]

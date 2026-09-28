# syntax=docker/dockerfile:1

FROM quay.io/coreos/etcd:v3.5.15 AS etcd

FROM python:3.12-slim-bookworm

LABEL org.opencontainers.image.source="https://github.com/anmisttt/study-platform"

WORKDIR /work
COPY --from=etcd /usr/local/bin/etcdctl /usr/local/bin/etcdctl
COPY common/lab-init-entrypoint.sh /usr/local/bin/lab-entrypoint.sh
COPY --from=task scaffold/ /lab/scaffold/
RUN chmod +x /usr/local/bin/lab-entrypoint.sh
ENTRYPOINT ["lab-entrypoint.sh"]
CMD ["bash"]

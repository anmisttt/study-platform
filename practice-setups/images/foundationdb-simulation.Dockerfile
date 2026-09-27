# syntax=docker/dockerfile:1

FROM foundationdb/foundationdb:7.3.69

LABEL org.opencontainers.image.source="https://github.com/anmisttt/study-platform"

WORKDIR /work
COPY common/lab-init-entrypoint.sh /usr/local/bin/lab-entrypoint.sh
COPY --from=task scaffold/ /lab/scaffold/
RUN chmod +x /usr/local/bin/lab-entrypoint.sh /lab/scaffold/*.sh

ENTRYPOINT ["lab-entrypoint.sh"]
CMD ["/bin/bash"]

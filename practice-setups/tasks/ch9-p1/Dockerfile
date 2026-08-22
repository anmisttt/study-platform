FROM python:3.12-slim-bookworm
WORKDIR /work

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      iproute2 tcpdump curl procps \
 && rm -rf /var/lib/apt/lists/*

COPY lab-init-entrypoint.sh /usr/local/bin/lab-entrypoint.sh
RUN chmod +x /usr/local/bin/lab-entrypoint.sh
COPY scaffold/ /lab/scaffold/
ENTRYPOINT ["lab-entrypoint.sh"]
CMD ["bash"]

FROM python:3.12-slim-bookworm
WORKDIR /work


COPY lab-init-entrypoint.sh /usr/local/bin/lab-entrypoint.sh
RUN chmod +x /usr/local/bin/lab-entrypoint.sh
COPY scaffold/ /lab/scaffold/
ENTRYPOINT ["lab-entrypoint.sh"]
CMD ["bash"]

FROM python:3.12-slim-bookworm
COPY ../common/lab-init-entrypoint.sh /usr/local/bin/lab-entrypoint.sh
RUN chmod +x /usr/local/bin/lab-entrypoint.sh
ENTRYPOINT ["lab-entrypoint.sh"]
CMD ["bash"]

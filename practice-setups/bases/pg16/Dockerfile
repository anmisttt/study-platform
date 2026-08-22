FROM postgres:16-bookworm

COPY lab-entrypoint.sh /usr/local/bin/lab-entrypoint.sh
RUN chmod +x /usr/local/bin/lab-entrypoint.sh

ENTRYPOINT ["lab-entrypoint.sh"]
CMD ["postgres"]

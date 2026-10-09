# syntax=docker/dockerfile:1

FROM python:3.12-slim-bookworm AS python

COPY --from=task requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

FROM postgres:16-bookworm

LABEL org.opencontainers.image.source="https://github.com/anmisttt/study-platform"

ENV PGDATA=/lab/pgdata \
    POSTGRES_DB=ch12_eos_lab \
    POSTGRES_USER=postgres

COPY --from=python /usr/local/ /usr/local/
COPY common/lab-init-entrypoint.sh /usr/local/bin/lab-entrypoint.sh
COPY --from=task seed.sql /tmp/seed.sql
COPY --from=task scaffold/ /lab/scaffold/
RUN chmod +x /usr/local/bin/lab-entrypoint.sh \
 && mkdir -p /lab \
 && chown -R postgres:postgres /lab

USER postgres
RUN initdb -D "$PGDATA" \
 && echo "listen_addresses = '*'" >> "$PGDATA/postgresql.conf" \
 && echo "host all all all trust" >> "$PGDATA/pg_hba.conf" \
 && pg_ctl -D "$PGDATA" -o "-c listen_addresses=''" -w start \
 && psql -v ON_ERROR_STOP=1 -d postgres -c "CREATE DATABASE ${POSTGRES_DB}" \
 && psql -v ON_ERROR_STOP=1 -d "${POSTGRES_DB}" -f /tmp/seed.sql \
 && pg_ctl -D "$PGDATA" -m fast -w stop

USER root
RUN rm /tmp/seed.sql
ENTRYPOINT ["lab-entrypoint.sh"]
CMD ["postgres"]

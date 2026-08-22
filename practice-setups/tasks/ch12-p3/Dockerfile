ARG BASE_IMAGE=ghcr.io/anmisttt/ddia-practice-base:pg16
FROM ${BASE_IMAGE}

ENV PGDATA=/lab/pgdata \
    POSTGRES_DB=ch12_views_lab \
    POSTGRES_PASSWORD=lab \
    POSTGRES_USER=postgres

COPY seed.sql /lab/seed.sql
COPY scaffold/ /lab/scaffold/
COPY lab-init-entrypoint.sh /usr/local/bin/lab-entrypoint.sh
RUN chmod +x /usr/local/bin/lab-entrypoint.sh && mkdir -p /lab && chown -R postgres:postgres /lab

USER postgres
RUN initdb -D "$PGDATA" \
 && pg_ctl -D "$PGDATA" -o "-c listen_addresses=''" -w start \
 && psql -v ON_ERROR_STOP=1 -d postgres -c "CREATE DATABASE ch12_views_lab" \
 && psql -v ON_ERROR_STOP=1 -d ch12_views_lab -f /lab/seed.sql \
 && pg_ctl -D "$PGDATA" -m fast -w stop

USER root
ENTRYPOINT ["lab-entrypoint.sh"]
CMD ["postgres"]

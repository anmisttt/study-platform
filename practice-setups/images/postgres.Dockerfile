# syntax=docker/dockerfile:1

FROM postgres:16-bookworm

LABEL org.opencontainers.image.source="https://github.com/anmisttt/study-platform"

ARG POSTGRES_DB=lab
ENV PGDATA=/lab/pgdata \
    POSTGRES_DB=${POSTGRES_DB} \
    POSTGRES_PASSWORD=lab \
    POSTGRES_USER=postgres

COPY common/lab-init-entrypoint.sh /usr/local/bin/lab-entrypoint.sh
RUN chmod +x /usr/local/bin/lab-entrypoint.sh

COPY --from=task seed.sql /lab/seed.sql
COPY --from=task scaffold/ /lab/scaffold/
RUN mkdir -p /lab && chown -R postgres:postgres /lab

USER postgres
RUN initdb -D "$PGDATA" \
 && echo "listen_addresses = '*'" >> "$PGDATA/postgresql.conf" \
 && echo "host all all all trust" >> "$PGDATA/pg_hba.conf" \
 && pg_ctl -D "$PGDATA" -o "-c listen_addresses=''" -w start \
 && psql -v ON_ERROR_STOP=1 -d postgres -c "CREATE DATABASE ${POSTGRES_DB}" \
 && psql -v ON_ERROR_STOP=1 -d "${POSTGRES_DB}" -f /lab/seed.sql \
 && pg_ctl -D "$PGDATA" -m fast -w stop

USER root
ENTRYPOINT ["lab-entrypoint.sh"]
CMD ["postgres"]

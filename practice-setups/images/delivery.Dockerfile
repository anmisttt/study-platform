# syntax=docker/dockerfile:1

FROM python:3.12-slim-bookworm

ARG APT_PACKAGES=""
WORKDIR /work
RUN if [ -n "${APT_PACKAGES}" ]; then \
      apt-get update \
      && apt-get install -y --no-install-recommends ${APT_PACKAGES} \
      && rm -rf /var/lib/apt/lists/*; \
    fi

RUN --mount=type=bind,from=task,source=.,target=/task \
    if [ -s /task/requirements.txt ]; then \
      pip install --no-cache-dir -r /task/requirements.txt; \
    fi
COPY bases/common/lab-init-entrypoint.sh /usr/local/bin/lab-entrypoint.sh
COPY --from=task scaffold/ /lab/scaffold/
RUN chmod +x /usr/local/bin/lab-entrypoint.sh
ENTRYPOINT ["lab-entrypoint.sh"]
CMD ["bash"]

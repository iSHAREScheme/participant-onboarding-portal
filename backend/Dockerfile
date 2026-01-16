# syntax=docker/dockerfile:1.6
# FROM golang:1.23 AS builder
# WORKDIR /opt/app
# COPY . .
# RUN go mod download
# RUN go build -o app ./cmd/...
# EXPOSE 8081
# ENTRYPOINT [ "/opt/app/app" ]

FROM golang:1.23-alpine AS build
WORKDIR /opt/app
RUN apk add --no-cache build-base sqlite-dev

 # download deps for build cache
COPY go.mod go.sum ./
RUN go mod download

COPY . .
# Pin swagger deps against the repo's go.mod (copied above)

ENV CGO_ENABLED=1
RUN go build -ldflags="-s -w" -o app ./cmd/...

# Final stage
FROM alpine:3.18
# Install CA certificates and SQLite runtime
RUN apk add --no-cache ca-certificates sqlite-libs su-exec

WORKDIR /app

EXPOSE 8081

# non-root user
RUN addgroup -g 1001 appgroup && \
    adduser -D -u 1000 -G appgroup appuser

COPY --chown=appuser:appgroup --chmod=0555 --from=build /opt/app/app /app/app


RUN mkdir -p /app/config /app/keys /app/resources
COPY --chown=appuser:appgroup --chmod=0440 config/*.yaml /app/config/
COPY --chown=appuser:appgroup --chmod=0440 resources/ /app/resources/

# Add private key via BuildKit secret when provided; skip locally
RUN --mount=type=secret,id=SAT_PRIVATE_KEY \
    sh -c 'set -e; mkdir -p /app/keys; \
    if [ -f /run/secrets/SAT_PRIVATE_KEY ]; then \
      install -m 400 -o appuser -g appgroup /run/secrets/SAT_PRIVATE_KEY /app/keys/dil-sat-private-key.pem; \
    else \
      echo "No SAT_PRIVATE_KEY secret provided at build time; skipping."; \
    fi'

WORKDIR /app
# bootstrap: ensure parent dir for DB exists (if path has a slash) and uploads dir exists
RUN printf '%s\n' \
  '#!/bin/sh' \
  'set -eu' \
  'DBFILE="${SQLITE_DB_NAME:-/app/db/test.db}"' \
  'UPLOADS_DIR="${UPLOADS_DIR:-/app/uploads}"' \
  'DBDIR="$(dirname "$DBFILE")"' \
  'if [ "$DBDIR" = "$DBFILE" ]; then' \
  '  DBDIR="/app"' \
  'fi' \
  'mkdir -p "$DBDIR" "$UPLOADS_DIR"' \
  'chown -R appuser:appgroup "$DBDIR" "$UPLOADS_DIR"' \
  'exec su-exec appuser:appgroup ./app' > /app/entrypoint.sh && \
  chmod 0555 /app/entrypoint.sh && \
  sed -i 's/\r$//' /app/entrypoint.sh

# keep existing perms on app binary
USER root
ENTRYPOINT ["/bin/sh", "/app/entrypoint.sh"]

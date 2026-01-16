## License
This project is licensed under the [Apache License 2.0](./LICENSE.txt).

# Backend Service

This is a Go backend service, Dockerized for local and production environments.

## Image Build & Publish

See `deploy.md` for how images are built/published and how to use them.

## Prerequisites

### Runtime / tooling

- Go `1.23.2+` (see `go.mod`) if running locally (without Docker)
- Docker (Docker Desktop/Engine) with `docker compose` (Compose v2)
- `make` (optional) for the Makefile shortcuts
- Node.js + `yarn` (optional) for repo tooling like `husky`/`commitlint`

### Local (non-Docker) build requirements

This service uses `gorm.io/driver/sqlite` which relies on `github.com/mattn/go-sqlite3` (CGO). If you run the service directly with Go (instead of Docker), you need:

- A C toolchain (clang/gcc)
- SQLite development headers/libraries

### Required config / files

- Environment variables via `.env` (used by `docker-compose.yml`) or exported in your shell.
  - At minimum: `SERVER_PORT` (default `8081`) and `SQLITE_DB_NAME` (e.g. `db/test.db`)
  - For a healthy `/healthcheck` and iSHARE token flows you also need the `SATELLITE_*` variables, in particular `SATELLITE_PRIVATE_KEY` (PEM-encoded private key contents).
  - OIDC auth is required unless `OIDC_DISABLE=true`; set `OIDC_ISSUER`, `OIDC_AUDIENCE`, and `OIDC_JWKS_URL` for Keycloak-based auth.
- A SQLite database file at the location pointed to by `SQLITE_DB_NAME` (created on first run).
- If you manage keys as files, ensure a `keys/` directory exists (mounted into the container by `docker-compose.yml`).

## Commands

- `make up` – Build + run via Docker Compose (detached)
- `make down` – Stop the stack
- `make logs` – Tail logs
- `make restart` – Rebuild + restart backend only
- `make push-image VERSION_TAG=vX.Y.Z` – Build + push image (override `IMAGE=...` if needed)

## Exposed Port

- http://localhost:8081

## Branch

Initial commit pushed on `dev` branch.

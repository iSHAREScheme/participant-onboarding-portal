# iSHARE Onboarding Portal

Monorepo for the iSHARE Foundation onboarding portal. It contains:
- backend/ (Go API service)
- frontend/ (Next.js web app + Keycloak)

## Quick start (local build with Docker Compose)

1. Copy `.env.example` to `.env` and fill in values.
2. If you use file-based keys, place them in `backend/keys` and set `SATELLITE_PRIVATE_KEY_PATH`.
3. Run: `docker compose up -d --build`
4. Open:
   - Frontend: http://localhost:3000
   - Keycloak: http://localhost:8080
   - Backend healthcheck: http://localhost:8081/healthcheck

## Run with prebuilt images (release)

1. Copy `.env.example` to `.env` and set `GHCR_OWNER` (e.g. `isharescheme`) and `IMAGE_TAG` (e.g. `v1.2.3`).
2. If you use file-based keys, place them in `backend/keys` and set `SATELLITE_PRIVATE_KEY_PATH`.
3. Run: `docker compose -f docker-compose.prod.yml up -d`

## Release process

Versioned images and GitHub Releases are published on tags. See `RELEASE.md` for the exact steps.

## Frontend runtime config

The frontend reads `NEXT_PUBLIC_*` values from `/env.js`, generated at container start (or via `yarn write-env` in `frontend/`). Update `.env` and restart the frontend container to apply changes; no rebuild needed.

Note: Security headers (including CSP) are not set by the frontend app; configure them at your reverse proxy. Admin routes are controlled at runtime via `NEXT_PUBLIC_DISABLE_ADMIN_ROUTES`.

## Optional nginx-proxy + automatic TLS

This is a minimal reverse-proxy example using `jwilder/nginx-proxy` with the ACME companion for automatic TLS.

1. Copy `.env.example` to `.env` and set:
   - `FRONTEND_VIRTUAL_HOST`, `BACKEND_VIRTUAL_HOST`, `KEYCLOAK_VIRTUAL_HOST`
   - `LETSENCRYPT_EMAIL`
   - `NEXT_PUBLIC_FRONTEND_DOMAIN` (e.g. `https://portal.example.com`)
   - `NEXT_PUBLIC_BASE_SERVER_URL` (e.g. `https://api.example.com`)
   - `NEXT_PUBLIC_KEYCLOAK_BASE_URL` (e.g. `https://auth.example.com`)
2. Run: `docker compose -f docker-compose.prod.yml -f docker-compose.proxy.yml -f docker-compose.proxy.acme.yml up -d`

Caveats:
- ACME HTTP-01 requires the domains to resolve publicly to this host and port 80/443 to be reachable.
- Certificate issuance is subject to Let’s Encrypt rate limits.
- Wildcard certificates require DNS-01 and are not covered by this minimal setup.

## Notes

- Public commit history starts at the open-source release; prior history is kept in a private archive for audit purposes.
- The SQLite database is created automatically on first backend start (GORM AutoMigrate); no preseeded `test.db` is required.
- If you run the frontend outside Docker, set `NEXT_PUBLIC_BASE_SERVER_URL=http://localhost:8081`.
- If you change the `OBP_ADMIN_*` values after first boot, restart the Keycloak container to re-import the realm.
- For full frontend environment options and Keycloak setup steps, see `frontend/README.md`.
- For backend configuration details, see `backend/README.md`.

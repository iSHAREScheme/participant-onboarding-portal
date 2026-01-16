# Image Build & Publish

The monorepo publishes backend images via GitHub Actions in `/.github/workflows/build-images.yml`.

## When images are published

- Pull requests and `main` pushes build for verification (no push).
- Tags matching `v*` push images to GHCR.

## Image naming

- `ghcr.io/<owner>/onboarding-portal-backend:<tag>`

## Using the published image

The `backend/docker-compose.yml` file expects:

- `GHCR_OWNER` (organization/user)
- `IMAGE_TAG` (defaults to `latest`)

Example:

```
GHCR_OWNER=<owner> IMAGE_TAG=v1.2.3 docker compose pull
GHCR_OWNER=<owner> IMAGE_TAG=v1.2.3 docker compose up -d
```

Deployment is user-managed; choose your own hosting and update strategy.

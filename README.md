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

## Identity verification

The identity check is the first onboarding step, before role selection and
M2M, so everything after it builds on a verified identity. Which methods an
applicant may use is chosen in **Settings → Onboarding → Identity
verification**: eIDAS certificate, eHerkenning, and Verifiable Credentials
(VCs). Each onboarding flow can override the choice, so every dataspace's
onboarding offers exactly the identity options it accepts.

The default is eIDAS + eHerkenning, which is what the portal offered before
the setting existed. eHerkenning is only offered when an eHerkenning identity
provider is configured. **VCs are off by default.**

## Onboarding with Verifiable Credentials (VCs)

Applicants can present Verifiable Credentials they already hold instead of typing their
organisation's details and proving identity by hand. The portal verifies the
presentation and fills in whatever it proved; anything it did not prove is
completed the usual way — hence *partial* onboarding.

Two ways in, both ending at the same verifier:

- **Wallet (cross-device OID4VP).** The portal opens a session, renders the
  request as a QR code, and the wallet posts the presentation straight back.
- **Direct.** The applicant pastes or uploads a presentation. No wallet needed,
  which also makes the feature testable before one is in the picture.

### What is verified

Each credential must clear every one of these, or the whole presentation is
refused:

1. its type is one this deployment accepts;
2. its `issuer` is one an admin has named as trusted for that type;
3. its signature verifies against a key resolved from that issuer's DID
   document or JWKS (iSHARE credentials embed no JWK, so the key is always
   resolved out-of-band);
4. `validFrom` / `validUntil` contain the present moment;
5. its Bitstring Status List does not mark it revoked.

Unsecured credentials embedded in a presentation are rejected outright — with
no proof there is nothing to verify, and accepting one would let an applicant
pre-fill the form with self-asserted data.

### Configuration

`VC_VERIFIER_BASE_URL` must be publicly reachable for the QR flow, because the
wallet runs on the applicant's phone (see `.env.example`). Everything else is
trust configuration and lives in **Settings → Onboarding**, admin-only:
accepted credential types, their trusted issuers and key-resolution URLs, and
the claim-to-field mapping. Defaults ship for the iSHARE v3 credential profile
and an EUDI legal-person profile, but **no issuer is trusted out of the box**,
so nothing verifies until an operator names one.

Two settings control how much manual work this removes, each overridable per
onboarding flow: whether VCs are offered at all (an identity verification
method, see above — off by default), and whether a VC-verified application
skips admin review.

### What it cannot do on its own

The iSHARE v3 claim model accepts only two identity claims, `x509Certificate`
and `idpAssertion`, so a party still needs one to be created in the registry.
When the presented credential carries that proof (an iSHARE framework may
include `x509Certificates` / `idpAssertions`), the applicant skips the
certificate step entirely. When it does not, everything else is still filled in
but they finish with eIDAS or eHerkenning as before — the UI says so explicitly.

### Trust boundary

The browser only ever submits a session id. Every verified value is re-read
server-side from that session when the proposal is saved and written over
whatever the form claimed, so a tampered request cannot pass off an unverified
party id or certificate as verified. Sessions are owned by the applicant who
opened them, are single-use, and expire.

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

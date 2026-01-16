# Frontend App

This is a Dockerized frontend application using Next.js.

## Prerequisites

### Required (recommended: Docker workflow)

- Docker Desktop / Docker Engine with Docker Compose v2 (`docker compose`)
- `make`
- Free local ports: `3000` (frontend) and `8080` (Keycloak)
- A running backend API reachable from inside the containers (configured via `NEXT_PUBLIC_BASE_SERVER_URL` in `.env`)
  - Default in this repo is `http://host.docker.internal:8081` (works on macOS/Windows)
  - On Linux, you may need to change it (for example to `http://172.17.0.1:8081`) or configure host-gateway support

### Optional (run without Docker)

- Node.js (recommended: `22.x` to match the `Dockerfile`; minimum: `18.17+` for Next.js 14)
- Corepack (ships with Node) to install the repo-pinned Yarn version (`package.json` uses `yarn@4.7.0`)
  - `corepack enable && corepack prepare yarn@4.7.0 --activate`

### Optional (custom Keycloak provider development)

- Java/JDK `17` and Maven (only needed for `make build-provider`)

## Commands

- `make up` – Build and run the dev stack (frontend + Keycloak + Postgres) in detached mode.
- `make up-kc` – Build and run Keycloak (+ Postgres) only.
- `make down` – Stop the running containers.
- `make build` – Build Docker images (no cache).
- `make logs` – View container logs.
- `make restart` – Restart the frontend container.
- `make restart-frontend` – Rebuild and restart only the frontend container.
- `make build-provider` – Build the custom Keycloak provider JAR into `keycloakProviders/`.
- `make restart-keycloak` – Restart Keycloak and tail logs.

## Exposed Port

- http://localhost:3000

## Image Build & Publish

See `DEPLOY.md` for image build/publish documentation.

## Environment

Ensure your backend and authentication services (like Keycloak) are available in dev setup or via another repo.

Runtime config: the client reads `NEXT_PUBLIC_*` values from `public/env.js`. `yarn dev` and `yarn start` generate it automatically via `scripts/write-env.js`. If you change `.env`, rerun the command or restart the dev server.

## Setup

1. Review `.env` and adjust values as needed (notably `NEXT_PUBLIC_BASE_SERVER_URL`, `NEXT_PUBLIC_KEYCLOAK_BASE_URL`, `NEXT_PUBLIC_KEYCLOAK_REALM`, `NEXT_PUBLIC_KEYCLOAK_CLIENT_ID`, `KEYCLOAK_ADMIN_USERNAME`, `KEYCLOAK_ADMIN_PASSWORD`). If you need a starting point, see `.env.example` (and `DEPLOY.md` for a minimal production example).
2. Run `make up` in your terminal.
3. Go to the Keycloak admin and login with the admin pass and username (`http://localhost:8080/admin`).
4. Click create realm (use the `NEXT_PUBLIC_KEYCLOAK_REALM` value from `.env` as the realm name).
5. Go to realm settings → Login and set user registration and email as username to true; go to Theme and set it to `keycloakCustom` if you want to use that one.
6. Create client (use the `NEXT_PUBLIC_KEYCLOAK_CLIENT_ID` value from `.env` as client id and choose OID Connect as type).
7. Click through to login settings and set `http://localhost:3000/*` as valid redirect URI.
8. Optional - configure E-herkenning
    a. go to identity providers and add an OIDC V1.0
    b. Enter Anoigo eHerkenning Broker as display name ( or your own if you want the users to see something else)
    c. Enter credentials: discovery endpoint, client id and client secret
    d. save and you are good to go!


## Walkthrough

-- user
1.  Login with E-Herkenning or create account and login
1a. Select Anoigo eHerkenning Broker (bottom of login screen)
1b. Then select Digidentity AD 1.13 (preproduction)
1c. Username: test1@mailinator.com
    Password: Test12345678!
1d. Choose Regional Sanjoflex
2.  Choose any role
3.  Click no when asked if you want to use m2m services
4.  Click continue on the identity check screen
5.  Fill in the party details and click continue
6.  in association settings select EU.EORI.NL000000004
6a. fill in any urls in the fields below
6b. upload a file as ctt proof and click continue
7.  add contact details and click continue
8.  confirm registration

-- admin
1.  create admin role and account
    a. login to keycloak admin panel
    b. select configured realm and go to realm roles
    c. create a role with the name onboarding-admin
    d. create a new admin user and assign the onboarding-admin role after creation
2.  Log in to admin account
3.  Approve registration

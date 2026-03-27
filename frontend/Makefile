.PHONY: up down build logs restart build-provider restart-keycloak

COMPOSE ?= docker-compose -f docker-compose-dev.yml

up:
	$(COMPOSE) up --build -d

up-kc:
	$(COMPOSE) up --build -d keycloak

down:
	$(COMPOSE) down

build:
	$(COMPOSE) build --no-cache

logs:
	$(COMPOSE) logs -f --tail=100

restart:
	make down && make up

restart-frontend:
	$(COMPOSE) stop frontend && $(COMPOSE) rm -f frontend && $(COMPOSE) build --no-cache frontend && $(COMPOSE) up -d frontend

# ---
# Build + deploy the custom Keycloak provider

KEYCLOAK_CONTAINER ?= keycloak
PROVIDER_SRC       := provider-src
PROVIDER_TARGET    := $(PROVIDER_SRC)/target
PROVIDER_JAR       := $(shell ls $(PROVIDER_TARGET)/*.jar 2>/dev/null | head -n 1)
PROVIDERS_DIR      := keycloak/keycloakProviders

build-provider:
	@echo ">>> Building provider with Maven..."
	cd $(PROVIDER_SRC) && mvn clean package
	@echo ">>> Copying jar to $(PROVIDERS_DIR)/"
	mkdir -p $(PROVIDERS_DIR)
	cp $(PROVIDER_TARGET)/*.jar $(PROVIDERS_DIR)/

restart-keycloak:
	@echo ">>> Restarting Keycloak container ($(KEYCLOAK_CONTAINER))..."
	docker restart $(KEYCLOAK_CONTAINER)
	@echo ">>> Tail Keycloak logs (Ctrl+C to stop)..."
	docker logs -f $(KEYCLOAK_CONTAINER)

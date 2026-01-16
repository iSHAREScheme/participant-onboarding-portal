.PHONY: up down build logs restart push-image

GHCR_OWNER ?= your-org
IMAGE ?= ghcr.io/$(GHCR_OWNER)/onboarding-portal-backend
VERSION_TAG ?=latest

up:
	docker compose up --build -d

down:
	docker compose down

build:
	docker compose build

logs:
	docker compose logs -f --tail=100

restart:
	docker compose stop backend
	docker compose up --build -d backend

push-image:
	@:$(if $(VERSION_TAG),,$(error VERSION_TAG is required (usage: make push-image VERSION_TAG=v1.2.3 [IMAGE=registry/namespace/name])))
	docker build -t $(IMAGE):$(VERSION_TAG) --platform linux/amd64 .
	docker push $(IMAGE):$(VERSION_TAG)

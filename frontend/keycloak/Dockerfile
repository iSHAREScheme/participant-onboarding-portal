
FROM quay.io/keycloak/keycloak:26.7.3 AS builder

ENV KC_FEATURES=scripts,preview \
    KC_DB=postgres

# copy custom provider & realm-export
COPY keycloakCustom /opt/keycloak/themes/keycloakCustom
# Registry-look login theme (iSHARE v3 house style, renders identity-provider
# buttons); the realm import selects it as the default login theme.
COPY myThemeV3 /opt/keycloak/themes/myThemeV3
COPY keycloakProviders /opt/keycloak/providers
COPY keycloakConfig.json /opt/keycloak/data/import/realm-export.json
COPY --chmod=0555 entrypoint.sh /usr/local/bin/kc-entrypoint.sh

# Pre-augment and do the realm import
RUN /opt/keycloak/bin/kc.sh build

# Runtime
FROM quay.io/keycloak/keycloak:26.7.3

ENV KC_FEATURES=scripts,preview \
    KC_DB=postgres

# copy build
COPY --from=builder /opt/keycloak/ /opt/keycloak/
COPY --from=builder /usr/local/bin/kc-entrypoint.sh /usr/local/bin/kc-entrypoint.sh
# copy export into image
COPY keycloakConfig.json /opt/keycloak/data/import/realm-export.json

# Make sure import file is readable
RUN chmod -R a+r /opt/keycloak/data/import || true


ENTRYPOINT ["/usr/local/bin/kc-entrypoint.sh"]

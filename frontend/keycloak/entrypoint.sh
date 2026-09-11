#!/usr/bin/env sh
set -eu

IMP="${KC_IMPORT_FILE:-/opt/keycloak/data/import/realm-export.json}"

echo "[kc-entrypoint] import file: $IMP"
if [ ! -f "$IMP" ]; then
  echo "[kc-entrypoint] MISSING: $IMP" >&2
fi
if [ ! -r "$IMP" ]; then
  echo "[kc-entrypoint] NOT READABLE: $IMP" >&2
  ls -l "$IMP" || true
fi

CMD="start"
if [ "$#" -gt 0 ]; then
  CMD="$1"
  shift
fi

# inject eherkenning cert chain
if [ -n "${EH_CHAIN_PEM:-}" ]; then
  mkdir -p /tmp/trust
  umask 077
  printf "%s" "$EH_CHAIN_PEM" > /tmp/trust/eh-chain.pem
fi

KC_BIN="${KC_BIN:-/opt/keycloak/bin/kc.sh}"

# kc_relative_path prints the HTTP relative path Keycloak serves under ("" for the root).
# Downstream images re-augment this one with `kc.sh build --http-relative-path=/auth`
# (PRDev shared Keycloak), which persists the option in the build without exporting any
# environment variable, so the admin API is at http://localhost:8080/auth. Precedence:
# KC_HTTP_RELATIVE_PATH (runtime/build env) > persisted build option (kc.sh show-config) > "".
kc_relative_path() {
  rel="${KC_HTTP_RELATIVE_PATH:-}"
  if [ -z "$rel" ]; then
    rel=$("$KC_BIN" show-config 2>/dev/null | sed -n 's/.*kc\.http-relative-path *= *\([^ ]*\).*/\1/p' | head -n 1)
  fi
  rel="${rel%/}"
  case "$rel" in
    "" ) printf '' ;;
    /* ) printf '%s' "$rel" ;;
    *  ) printf '/%s' "$rel" ;;
  esac
}

wait_for_admin_api() {
  if [ -z "${KC_BOOTSTRAP_ADMIN_USERNAME:-}" ] || [ -z "${KC_BOOTSTRAP_ADMIN_PASSWORD:-}" ]; then
    echo "[kc-entrypoint] admin credentials missing; skipping post-start admin updates" >&2
    return 1
  fi

  KC_ADMIN_URL="http://localhost:8080$(kc_relative_path)"
  echo "[kc-entrypoint] waiting for admin API at $KC_ADMIN_URL"
  i=0
  while [ "$i" -lt 60 ]; do
    if /opt/keycloak/bin/kcadm.sh config credentials \
      --server "$KC_ADMIN_URL" \
      --realm master \
      --user "$KC_BOOTSTRAP_ADMIN_USERNAME" \
      --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null 2>&1; then
      echo "[kc-entrypoint] admin API reachable at $KC_ADMIN_URL"
      return 0
    fi
    i=$((i+1))
    sleep 1
  done

  echo "[kc-entrypoint] WARNING: timed out waiting for Keycloak admin API at $KC_ADMIN_URL" >&2
  return 1
}

extract_json_string_field() {
  FIELD="$1"
  printf "%s\n" "$2" | sed -n "s/.*\"$FIELD\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -n 1
}

find_object_id_by_field() {
  FIELD="$1"
  VALUE="$2"
  CURRENT_ID=""

  while IFS= read -r line; do
    case "$line" in
      *'"id"'*)
        CURRENT_ID=$(extract_json_string_field id "$line")
        ;;
      *)
        if printf "%s\n" "$line" | grep -q "\"$FIELD\"[[:space:]]*:[[:space:]]*\"$VALUE\""; then
          printf "%s\n" "$CURRENT_ID"
          return 0
        fi
        ;;
    esac
  done <<EOF
$3
EOF

  return 1
}

sync_eherkenning_broker_flow() {
  REALM="${NEXT_PUBLIC_KEYCLOAK_REALM:-}"
  IDP_ALIAS="${KEYCLOAK_IDP_NAME:-eHerkenning}"
  CUSTOM_FLOW_ALIAS="portal first broker login"
  CUSTOM_FLOW_SUBFLOW_ALIAS="$CUSTOM_FLOW_ALIAS User creation or linking"
  CUSTOM_FLOW_SUBFLOW_PATH="portal%20first%20broker%20login%20User%20creation%20or%20linking"
  EXECUTION_PROVIDER="portal-link-authenticated-user"
  EXECUTION_DISPLAY_NAME="Portal link authenticated user"
  EXECUTION_CONFIG_ALIAS="portal link current user config"

  if [ -z "$REALM" ] || [ -z "$IDP_ALIAS" ]; then
    echo "[kc-entrypoint] broker flow sync skipped; NEXT_PUBLIC_KEYCLOAK_REALM or KEYCLOAK_IDP_NAME missing" >&2
    return 0
  fi

  FLOWS_JSON=$(/opt/keycloak/bin/kcadm.sh get authentication/flows -r "$REALM" 2>/dev/null || true)
  if ! printf "%s\n" "$FLOWS_JSON" | grep -q "\"alias\"[[:space:]]*:[[:space:]]*\"$CUSTOM_FLOW_ALIAS\""; then
    if ! /opt/keycloak/bin/kcadm.sh create "authentication/flows/first%20broker%20login/copy" -r "$REALM" \
      -s "newName=$CUSTOM_FLOW_ALIAS" >/dev/null; then
      echo "[kc-entrypoint] WARNING: failed to copy first broker login flow to '$CUSTOM_FLOW_ALIAS'" >&2
      return 0
    fi
  fi

  EXECUTIONS_JSON=$(/opt/keycloak/bin/kcadm.sh get "authentication/flows/$CUSTOM_FLOW_SUBFLOW_PATH/executions" -r "$REALM" 2>/dev/null || true)
  if [ -z "$EXECUTIONS_JSON" ]; then
    echo "[kc-entrypoint] WARNING: unable to read flow '$CUSTOM_FLOW_SUBFLOW_ALIAS'" >&2
    return 0
  fi

  EXECUTION_ID=$(find_object_id_by_field providerId "$EXECUTION_PROVIDER" "$EXECUTIONS_JSON" || true)
  if [ -z "$EXECUTION_ID" ]; then
    if ! /opt/keycloak/bin/kcadm.sh create "authentication/flows/$CUSTOM_FLOW_SUBFLOW_PATH/executions/execution" -r "$REALM" \
      -s "provider=$EXECUTION_PROVIDER" >/dev/null; then
      echo "[kc-entrypoint] WARNING: failed to add '$EXECUTION_PROVIDER' to '$CUSTOM_FLOW_SUBFLOW_ALIAS'" >&2
      return 0
    fi

    EXECUTIONS_JSON=$(/opt/keycloak/bin/kcadm.sh get "authentication/flows/$CUSTOM_FLOW_SUBFLOW_PATH/executions" -r "$REALM" 2>/dev/null || true)
    EXECUTION_ID=$(find_object_id_by_field providerId "$EXECUTION_PROVIDER" "$EXECUTIONS_JSON" || true)
  fi

  if [ -z "$EXECUTION_ID" ]; then
    echo "[kc-entrypoint] WARNING: unable to resolve '$EXECUTION_PROVIDER' execution id in '$CUSTOM_FLOW_SUBFLOW_ALIAS'" >&2
    return 0
  fi

  if ! /opt/keycloak/bin/kcadm.sh update "authentication/flows/$CUSTOM_FLOW_SUBFLOW_PATH/executions" -r "$REALM" \
    -b "{\"id\":\"$EXECUTION_ID\",\"requirement\":\"ALTERNATIVE\",\"priority\":5,\"providerId\":\"$EXECUTION_PROVIDER\",\"displayName\":\"$EXECUTION_DISPLAY_NAME\",\"configurable\":true,\"level\":0,\"index\":0}" >/dev/null; then
    echo "[kc-entrypoint] WARNING: failed to prioritize '$EXECUTION_PROVIDER' in '$CUSTOM_FLOW_SUBFLOW_ALIAS'" >&2
    return 0
  fi

  EXECUTION_JSON=$(/opt/keycloak/bin/kcadm.sh get "authentication/executions/$EXECUTION_ID" -r "$REALM" 2>/dev/null || true)
  EXECUTION_CONFIG_ID=$(extract_json_string_field authenticatorConfig "$EXECUTION_JSON")

  if [ -n "$EXECUTION_CONFIG_ID" ]; then
    if ! /opt/keycloak/bin/kcadm.sh update "authentication/config/$EXECUTION_CONFIG_ID" -r "$REALM" \
      -b "{\"id\":\"$EXECUTION_CONFIG_ID\",\"alias\":\"$EXECUTION_CONFIG_ALIAS\",\"config\":{\"identity.provider.aliases\":\"$IDP_ALIAS\"}}" >/dev/null; then
      echo "[kc-entrypoint] WARNING: failed to update '$EXECUTION_CONFIG_ALIAS'" >&2
    fi
  else
    if ! /opt/keycloak/bin/kcadm.sh create "authentication/executions/$EXECUTION_ID/config" -r "$REALM" \
      -b "{\"alias\":\"$EXECUTION_CONFIG_ALIAS\",\"config\":{\"identity.provider.aliases\":\"$IDP_ALIAS\"}}" >/dev/null; then
      echo "[kc-entrypoint] WARNING: failed to create '$EXECUTION_CONFIG_ALIAS'" >&2
    fi
  fi

  if ! /opt/keycloak/bin/kcadm.sh update "identity-provider/instances/$IDP_ALIAS" -r "$REALM" \
    -s "firstBrokerLoginFlowAlias=$CUSTOM_FLOW_ALIAS" >/dev/null; then
    echo "[kc-entrypoint] WARNING: failed to set first broker login flow '$CUSTOM_FLOW_ALIAS' for identity provider '$IDP_ALIAS'" >&2
    return 0
  fi

  echo "[kc-entrypoint] synced broker flow '$CUSTOM_FLOW_ALIAS' for '$IDP_ALIAS'"
}

sync_eherkenning_event_listener() {
  REALM="${NEXT_PUBLIC_KEYCLOAK_REALM:-}"
  LISTENER_ID="eherkenning-claim-sync"

  if [ -z "$REALM" ]; then
    echo "[kc-entrypoint] event listener sync skipped; NEXT_PUBLIC_KEYCLOAK_REALM missing" >&2
    return 0
  fi

  if ! /opt/keycloak/bin/kcadm.sh update "realms/$REALM" \
    -s "eventsEnabled=true" \
    -s "eventsListeners=[\"jboss-logging\",\"$LISTENER_ID\"]" >/dev/null; then
    echo "[kc-entrypoint] WARNING: failed to enable '$LISTENER_ID' event listener for realm '$REALM'" >&2
    return 0
  fi

  echo "[kc-entrypoint] synced event listener '$LISTENER_ID' for realm '$REALM'"
}

sync_frontend_client() {
  REALM="${NEXT_PUBLIC_KEYCLOAK_REALM:-}"
  CLIENT_ID="${NEXT_PUBLIC_KEYCLOAK_CLIENT_ID:-frontend}"
  FRONTEND_DOMAIN="${NEXT_PUBLIC_FRONTEND_DOMAIN:-}"

  if [ -z "$REALM" ] || [ -z "$FRONTEND_DOMAIN" ]; then
    echo "[kc-entrypoint] frontend client sync skipped; NEXT_PUBLIC_KEYCLOAK_REALM or NEXT_PUBLIC_FRONTEND_DOMAIN missing" >&2
    return 0
  fi

  FRONTEND_DOMAIN="${FRONTEND_DOMAIN%/}"
  CLIENT_JSON=$(/opt/keycloak/bin/kcadm.sh get clients -r "$REALM" -q clientId="$CLIENT_ID" 2>/dev/null || true)
  CLIENT_UUID=$(printf "%s\n" "$CLIENT_JSON" | sed -n 's/^[[:space:]]*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)

  if [ -z "$CLIENT_UUID" ]; then
    echo "[kc-entrypoint] WARNING: client '$CLIENT_ID' not found in realm '$REALM'; frontend client sync skipped" >&2
    return 0
  fi

  /opt/keycloak/bin/kcadm.sh update "clients/$CLIENT_UUID" -r "$REALM" \
    -s "rootUrl=$FRONTEND_DOMAIN" \
    -s "baseUrl=$FRONTEND_DOMAIN" \
    -s "redirectUris=[\"$FRONTEND_DOMAIN/*\"]" \
    -s "webOrigins=[\"$FRONTEND_DOMAIN\"]" >/dev/null

  MAPPERS_JSON=$(/opt/keycloak/bin/kcadm.sh get "clients/$CLIENT_UUID/protocol-mappers/models" -r "$REALM" 2>/dev/null || true)
  IDP_MAPPER_ID=""
  KVK_NUMBER_MAPPER_ID=""
  CURRENT_MAPPER_ID=""
  while IFS= read -r line; do
    case "$line" in
      *'"id"'*)
        CURRENT_MAPPER_ID=$(printf "%s\n" "$line" | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
        ;;
      *'"name"'*)
        if printf "%s\n" "$line" | grep -q '"name"[[:space:]]*:[[:space:]]*"idp"'; then
          IDP_MAPPER_ID="$CURRENT_MAPPER_ID"
        fi
        if printf "%s\n" "$line" | grep -q '"name"[[:space:]]*:[[:space:]]*"kvkNumber"'; then
          KVK_NUMBER_MAPPER_ID="$CURRENT_MAPPER_ID"
        fi
        ;;
    esac
  done <<EOF
$MAPPERS_JSON
EOF

  if [ -n "$IDP_MAPPER_ID" ]; then
    if ! /opt/keycloak/bin/kcadm.sh update "clients/$CLIENT_UUID/protocol-mappers/models/$IDP_MAPPER_ID" -r "$REALM" \
      -s "name=idp" \
      -s "protocol=openid-connect" \
      -s "protocolMapper=oidc-usersessionmodel-note-mapper" \
      -s 'config."user.session.note"=identity_provider' \
      -s 'config."introspection.token.claim"=true' \
      -s 'config."userinfo.token.claim"=true' \
      -s 'config."id.token.claim"=true' \
      -s 'config."access.token.claim"=true' \
      -s 'config."claim.name"=idp' \
      -s 'config."jsonType.label"=String' >/dev/null; then
      echo "[kc-entrypoint] WARNING: failed to update idp mapper for client '$CLIENT_ID'" >&2
    fi
  else
    if ! /opt/keycloak/bin/kcadm.sh create "clients/$CLIENT_UUID/protocol-mappers/models" -r "$REALM" \
      -s "name=idp" \
      -s "protocol=openid-connect" \
      -s "protocolMapper=oidc-usersessionmodel-note-mapper" \
      -s 'config."user.session.note"=identity_provider' \
      -s 'config."introspection.token.claim"=true' \
      -s 'config."userinfo.token.claim"=true' \
      -s 'config."id.token.claim"=true' \
      -s 'config."access.token.claim"=true' \
      -s 'config."claim.name"=idp' \
      -s 'config."jsonType.label"=String' >/dev/null; then
      echo "[kc-entrypoint] WARNING: failed to create idp mapper for client '$CLIENT_ID'" >&2
    fi
  fi

  if [ -n "$KVK_NUMBER_MAPPER_ID" ]; then
    if ! /opt/keycloak/bin/kcadm.sh update "clients/$CLIENT_UUID/protocol-mappers/models/$KVK_NUMBER_MAPPER_ID" -r "$REALM" \
      -s "name=kvkNumber" \
      -s "protocol=openid-connect" \
      -s "protocolMapper=oidc-usermodel-attribute-mapper" \
      -s 'config."user.attribute"=kvk' \
      -s 'config."introspection.token.claim"=true' \
      -s 'config."userinfo.token.claim"=true' \
      -s 'config."id.token.claim"=true' \
      -s 'config."access.token.claim"=true' \
      -s 'config."claim.name"=kvkNumber' \
      -s 'config."jsonType.label"=String' \
      -s 'config."lightweight.claim"=false' >/dev/null; then
      echo "[kc-entrypoint] WARNING: failed to update kvkNumber mapper for client '$CLIENT_ID'" >&2
    fi
  fi

  echo "[kc-entrypoint] synced client '$CLIENT_ID' to $FRONTEND_DOMAIN"
}

post_start_bootstrap() {
  if ! wait_for_admin_api; then
    return 0
  fi

  if [ -n "${KC_DEV_MASTER_SSL_REQUIRED:-}" ]; then
    /opt/keycloak/bin/kcadm.sh update realms/master -s sslRequired="$KC_DEV_MASTER_SSL_REQUIRED" >/dev/null 2>&1 || true
  fi

  sync_frontend_client
  sync_eherkenning_broker_flow
  sync_eherkenning_event_listener
}

start_with_bootstrap() {
  MODE="$1"
  shift

  /opt/keycloak/bin/kc.sh "$MODE" \
    --import-realm \
    ${EH_CHAIN_PEM:+--truststore-paths=/tmp/trust} \
    "$@" &
  KC_PID=$!
  trap 'kill -TERM "$KC_PID" 2>/dev/null || true' INT TERM

  post_start_bootstrap

  wait "$KC_PID"
  exit $?
}

case "$CMD" in
  start-dev)
    start_with_bootstrap start-dev "$@"
    ;;
  start)
    start_with_bootstrap start --optimized "$@"
    ;;
  *)
    exec /opt/keycloak/bin/kc.sh "$CMD" "$@"
    ;;
esac

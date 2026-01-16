#!/usr/bin/env sh
set -eu

IMP="${KC_IMPORT_FILE:-/opt/keycloak/data/import/realm-export.json}"
STRAT="${KC_IMPORT_STRATEGY:-IGNORE_EXISTING}"

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

case "$CMD" in
  start-dev)
    if [ -n "${KC_DEV_MASTER_SSL_REQUIRED:-}" ]; then
      /opt/keycloak/bin/kc.sh start-dev \
        --import-realm \
        --import-realm-strategy="$STRAT" \
        ${EH_CHAIN_PEM:+--truststore-paths=/tmp/trust} \
        "$@" &
      KC_PID=$!
      trap 'kill -TERM "$KC_PID" 2>/dev/null || true' INT TERM

      if [ -z "${KC_BOOTSTRAP_ADMIN_USERNAME:-}" ] || [ -z "${KC_BOOTSTRAP_ADMIN_PASSWORD:-}" ]; then
        echo "[kc-entrypoint] KC_DEV_MASTER_SSL_REQUIRED set but admin credentials missing; skipping master realm update" >&2
      else
        echo "[kc-entrypoint] Waiting for Keycloak to set master sslRequired=${KC_DEV_MASTER_SSL_REQUIRED}..."
        i=0
        while [ "$i" -lt 60 ]; do
          if /opt/keycloak/bin/kcadm.sh config credentials \
            --server http://localhost:8080 \
            --realm master \
            --user "$KC_BOOTSTRAP_ADMIN_USERNAME" \
            --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null 2>&1; then
            /opt/keycloak/bin/kcadm.sh update realms/master -s sslRequired="$KC_DEV_MASTER_SSL_REQUIRED" >/dev/null 2>&1 || true
            break
          fi
          i=$((i+1))
          sleep 1
        done
        if [ "$i" -ge 60 ]; then
          echo "[kc-entrypoint] WARNING: timed out waiting for Keycloak; master realm not updated" >&2
        fi
      fi

      wait "$KC_PID"
      exit $?
    fi

    exec /opt/keycloak/bin/kc.sh start-dev \
      --import-realm \
      --import-realm-strategy="$STRAT" \
      ${EH_CHAIN_PEM:+--truststore-paths=/tmp/trust} \
      "$@"
    ;;
  start)
    exec /opt/keycloak/bin/kc.sh start \
      --optimized \
      --import-realm \
      --import-realm-strategy="$STRAT" \
      ${EH_CHAIN_PEM:+--truststore-paths=/tmp/trust} \
      "$@"
    ;;
  *)
    exec /opt/keycloak/bin/kc.sh "$CMD" "$@"
    ;;
esac

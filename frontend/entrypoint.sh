#!/bin/sh
set -eu

node /app/scripts/write-env.js

exec "$@"

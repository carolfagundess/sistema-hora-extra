#!/bin/sh
# Aplica migracoes pendentes antes de subir o servidor, toda vez que o
# container inicia. Idempotente (migrate.js so aplica o que falta).
set -e

node scripts/migrate.js

exec "$@"

#!/usr/bin/env bash
# Backup diario do banco SQLite. Usa a API online backup do SQLite (via
# sqlite3 CLI) para copiar com seguranca mesmo com o app rodando (evita
# copiar o arquivo no meio de uma escrita, o que corromperia o backup).
set -euo pipefail

ORIGEM="/var/lib/horas-extras/dados.sqlite"
DESTINO_DIR="/var/backups/horas-extras"
RETENCAO_DIAS=30

mkdir -p "$DESTINO_DIR"

DATA=$(date +%Y-%m-%d_%H%M%S)
DESTINO="$DESTINO_DIR/dados-$DATA.sqlite"

sqlite3 "$ORIGEM" ".backup '$DESTINO'"
gzip "$DESTINO"

echo "Backup criado: $DESTINO.gz"

# Remove backups mais antigos que a retencao configurada.
find "$DESTINO_DIR" -name 'dados-*.sqlite.gz' -mtime "+$RETENCAO_DIAS" -delete

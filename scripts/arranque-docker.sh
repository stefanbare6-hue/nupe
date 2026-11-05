#!/bin/sh
# Arranque do contêiner. Um volume montado pelo provedor chega com dono root,
# e o app roda como node: sem esta passada ele subiria, aceitaria login e só
# falharia na primeira gravação. Corrigimos a posse e entregamos o processo ao
# usuário node antes de subir o servidor.
set -e

DADOS="$(dirname "${NUPE_DATA:-/dados/nupe.json}")"
mkdir -p "$DADOS"

if [ "$(id -u)" = "0" ]; then
  if [ "$(stat -c %u "$DADOS" 2>/dev/null || echo 0)" != "1000" ]; then
    chown -R node:node "$DADOS"
  fi
  exec su-exec node node apps/api/dist/server.js
fi

exec node apps/api/dist/server.js

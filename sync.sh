#!/bin/bash
set -euo pipefail

HOST="${1:-ubuntu@43.142.146.46}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="rsl-prod-api:latest"
SSH=(ssh -o BatchMode=yes -o ServerAliveInterval=15)
RSYNC_E=(rsync -az -e "ssh -o BatchMode=yes -o ServerAliveInterval=15")

cd "$ROOT/vue3"
pnpm build

docker build -t "$IMAGE" "$ROOT/server"
docker save "$IMAGE" | "${SSH[@]}" "$HOST" sudo docker load

"${SSH[@]}" "$HOST" "sudo mkdir -p /opt/rsl/deploy/nginx /opt/rsl/deploy/portal /opt/rsl/vue3 && sudo chown -R ubuntu:ubuntu /opt/rsl"

"${RSYNC_E[@]}" \
  "$ROOT/deploy/docker-compose.prod.yml" \
  "$ROOT/deploy/docker-compose.hermes.yml" \
  "$ROOT/deploy/remote-up.sh" \
  "$ROOT/deploy/server-init.sh" \
  "$ROOT/deploy/hermes-up.sh" \
  "$ROOT/deploy/acme-dns-auth.sh" \
  "$ROOT/deploy/.env.example" \
  "$HOST:/opt/rsl/deploy/"
"${RSYNC_E[@]}" "$ROOT/deploy/nginx/" "$HOST:/opt/rsl/deploy/nginx/"
"${RSYNC_E[@]}" "$ROOT/deploy/portal/" "$HOST:/opt/rsl/deploy/portal/"
"${RSYNC_E[@]}" --delete "$ROOT/vue3/dist/" "$HOST:/opt/rsl/vue3/dist/"

"${SSH[@]}" "$HOST" "chmod +x /opt/rsl/deploy/server-init.sh /opt/rsl/deploy/remote-up.sh && bash /opt/rsl/deploy/remote-up.sh"

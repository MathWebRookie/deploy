#!/bin/bash
set -euo pipefail

HOST="${1:-ubuntu@43.142.146.46}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

ssh "$HOST" "sudo mkdir -p /opt/rsl && sudo chown -R ubuntu:ubuntu /opt/rsl"
rsync -az \
  --exclude node_modules \
  --exclude dist \
  --exclude .env \
  --exclude vue3/dist \
  "$ROOT/server" "$ROOT/vue3" "$ROOT/deploy" \
  "$HOST:/opt/rsl/"

ssh "$HOST" "chmod +x /opt/rsl/deploy/server-init.sh /opt/rsl/deploy/remote-up.sh && bash /opt/rsl/deploy/remote-up.sh"

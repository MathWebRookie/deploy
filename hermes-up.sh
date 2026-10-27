#!/bin/bash
set -euo pipefail

HOST="${1:-ubuntu@43.142.146.46}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH=(ssh -o BatchMode=yes -o ServerAliveInterval=15)
RSYNC_E=(rsync -az -e "ssh -o BatchMode=yes -o ServerAliveInterval=15")

"${SSH[@]}" "$HOST" "sudo mkdir -p /opt/rsl/deploy/nginx /opt/hermes && sudo chown -R ubuntu:ubuntu /opt/rsl /opt/hermes"

"${RSYNC_E[@]}" \
  "$ROOT/deploy/docker-compose.hermes.yml" \
  "$ROOT/deploy/hermes-up.sh" \
  "$HOST:/opt/rsl/deploy/"
"${RSYNC_E[@]}" "$ROOT/deploy/nginx/agent.conf" "$HOST:/opt/rsl/deploy/nginx/agent.conf"

"${SSH[@]}" "$HOST" "bash -s" <<'EOF'
set -euo pipefail
if [ ! -f /opt/hermes/deploy.env ]; then
  umask 077
  cat > /opt/hermes/deploy.env <<ENV
HERMES_DASHBOARD=1
HERMES_DASHBOARD_BASIC_AUTH_USERNAME=admin
HERMES_DASHBOARD_BASIC_AUTH_PASSWORD=$(openssl rand -hex 18)
HERMES_DASHBOARD_BASIC_AUTH_SECRET=$(openssl rand -hex 32)
API_SERVER_ENABLED=true
API_SERVER_HOST=0.0.0.0
API_SERVER_KEY=$(openssl rand -hex 32)
ENV
  chmod 600 /opt/hermes/deploy.env
fi

if [ ! -f /opt/hermes/config.yaml ]; then
  gateway=$(sudo docker network inspect rsl-prod_default --format '{{(index .IPAM.Config 0).Gateway}}')
  cat > /opt/hermes/config.yaml <<YAML
dashboard:
  public_url: "https://agent.slwithmj.store"
  trusted_proxies:
    - "${gateway}/32"
YAML
fi

sudo docker compose -f /opt/rsl/deploy/docker-compose.hermes.yml pull
sudo docker compose -f /opt/rsl/deploy/docker-compose.hermes.yml up -d

if [ -f /etc/letsencrypt/live/agent.slwithmj.store/fullchain.pem ]; then
  sudo cp /opt/rsl/deploy/nginx/agent.conf /etc/nginx/sites-available/agent.conf
  sudo ln -sfn /etc/nginx/sites-available/agent.conf /etc/nginx/sites-enabled/agent.conf
  sudo nginx -t
  sudo systemctl reload nginx
fi
EOF

#!/bin/bash
set -euo pipefail

if ! swapon --show | grep -q '/swapfile'; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

sudo DEBIAN_FRONTEND=noninteractive apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y git nginx
if ! docker compose version >/dev/null 2>&1; then
  sudo apt-get install -y docker-compose-plugin
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
sudo mkdir -p /var/www/portal /var/www/rsl
if [ -d "$ROOT/deploy/portal" ]; then
  sudo cp -a "$ROOT/deploy/portal/." /var/www/portal/
fi
if [ -f /etc/letsencrypt/live/slwithmj.store/fullchain.pem ]; then
  sudo cp "$ROOT/deploy/nginx/vue3.https.conf" /etc/nginx/sites-available/vue3.conf
else
  sudo cp "$ROOT/deploy/nginx/vue3.conf" /etc/nginx/sites-available/vue3.conf
fi
sudo ln -sfn /etc/nginx/sites-available/vue3.conf /etc/nginx/sites-enabled/vue3.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx

if command -v ufw >/dev/null 2>&1; then
  sudo ufw allow 22/tcp || true
  sudo ufw allow 80/tcp || true
  sudo ufw allow 443/tcp || true
fi

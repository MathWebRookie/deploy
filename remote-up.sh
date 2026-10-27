#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v nginx >/dev/null 2>&1; then
  bash "$ROOT/deploy/server-init.sh"
else
  if [ -f /etc/letsencrypt/live/slwithmj.store/fullchain.pem ]; then
    sudo cp "$ROOT/deploy/nginx/vue3.https.conf" /etc/nginx/sites-available/vue3.conf
  else
    sudo cp "$ROOT/deploy/nginx/vue3.conf" /etc/nginx/sites-available/vue3.conf
  fi
  sudo ln -sfn /etc/nginx/sites-available/vue3.conf /etc/nginx/sites-enabled/vue3.conf
  sudo rm -f /etc/nginx/sites-enabled/default
fi

if [ ! -f "$ROOT/deploy/.env" ]; then
  umask 077
  cat > "$ROOT/deploy/.env" <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
EOF
fi

if [ ! -f "$ROOT/vue3/dist/index.html" ]; then
  echo "缺少前端打包结果 $ROOT/vue3/dist" >&2
  exit 1
fi

sudo docker compose --env-file "$ROOT/deploy/.env" -f "$ROOT/deploy/docker-compose.prod.yml" up -d --no-build --force-recreate api

sudo mkdir -p /var/www/portal /var/www/rsl
sudo cp -a "$ROOT/deploy/portal/." /var/www/portal/
sudo rm -rf /var/www/rsl/*
sudo cp -a "$ROOT/vue3/dist/." /var/www/rsl/
sudo nginx -t
sudo systemctl reload nginx

if [ -f /etc/letsencrypt/live/slwithmj.store/fullchain.pem ]; then
  echo "站点已启动。门户 https://slwithmj.store/ ，应用 https://slwithmj.store/rsl/"
else
  echo "站点已启动。门户 http://slwithmj.store/ ，应用 http://slwithmj.store/rsl/"
fi
echo "登录账号 admin / 123456"
echo "若外网打不开，到腾讯云防火墙放行 80 和 443 端口。"

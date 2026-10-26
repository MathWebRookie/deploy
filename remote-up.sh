#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v nginx >/dev/null 2>&1; then
  bash "$ROOT/deploy/server-init.sh"
else
  sudo cp "$ROOT/deploy/nginx/vue3.conf" /etc/nginx/sites-available/vue3.conf
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

echo "站点已启动。在浏览器打开 http://$(curl -fsS ifconfig.me || hostname -I | awk '{print $1}')"
echo "登录账号 admin / 123456"
echo "若外网打不开，到腾讯云防火墙放行 80 端口。"

#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash "$ROOT/deploy/server-init.sh"

if [ ! -f "$ROOT/deploy/.env" ]; then
  umask 077
  cat > "$ROOT/deploy/.env" <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
EOF
fi

sudo docker compose --env-file "$ROOT/deploy/.env" -f "$ROOT/deploy/docker-compose.prod.yml" up -d --build

sudo docker run --rm \
  -v "$ROOT/vue3:/app" \
  -w /app \
  node:22-alpine \
  sh -c "corepack enable && corepack prepare pnpm@10.24.0 --activate && pnpm install --frozen-lockfile && find node_modules/.pnpm -path '*/esbuild/install.js' -exec node {} \\; && pnpm build"

sudo mkdir -p /var/www/portal /var/www/rsl
sudo cp -a "$ROOT/deploy/portal/." /var/www/portal/
sudo rm -rf /var/www/rsl/*
sudo cp -a "$ROOT/vue3/dist/." /var/www/rsl/
sudo nginx -t
sudo systemctl reload nginx

echo "站点已启动。在浏览器打开 http://$(curl -fsS ifconfig.me || hostname -I | awk '{print $1}')"
echo "登录账号 admin / 123456"
echo "若外网打不开，到腾讯云防火墙放行 80 端口。"

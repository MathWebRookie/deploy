#!/bin/bash
set -euo pipefail

HOST="${1:-ubuntu@43.142.146.46}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH=(ssh -o BatchMode=yes -o ServerAliveInterval=15)
RSYNC_E=(rsync -az -e "ssh -o BatchMode=yes -o ServerAliveInterval=15")

"${SSH[@]}" "$HOST" "sudo mkdir -p /opt/rsl/deploy/nginx /opt/hermes/skills /opt/hermes/secrets && sudo chown -R ubuntu:ubuntu /opt/rsl /opt/hermes"

"${RSYNC_E[@]}" \
  "$ROOT/deploy/docker-compose.hermes.yml" \
  "$ROOT/deploy/hermes-up.sh" \
  "$HOST:/opt/rsl/deploy/"
"${RSYNC_E[@]}" "$ROOT/deploy/nginx/agent.conf" "$HOST:/opt/rsl/deploy/nginx/agent.conf"
"${RSYNC_E[@]}" --delete "$ROOT/hermes-skills/" "$HOST:/opt/hermes/skills/"

"${SSH[@]}" "$HOST" "bash -s" <<'EOF'
set -euo pipefail
if [ ! -f /opt/rsl/deploy/.env ] || ! grep -q '^LEDGER_SKILL_API_KEY=' /opt/rsl/deploy/.env; then
  echo "缺少 /opt/rsl/deploy/.env 中的 LEDGER_SKILL_API_KEY；请先部署 API。" >&2
  exit 1
fi

ledger_key=$(sed -n 's/^LEDGER_SKILL_API_KEY=//p' /opt/rsl/deploy/.env | tail -n 1)
umask 077
cat > /opt/hermes/secrets/ledger.env <<ENV
LEDGER_API_BASE_URL=http://api:3000
LEDGER_SKILL_API_KEY=${ledger_key}
ENV
chmod 600 /opt/hermes/secrets/ledger.env

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

gateway=$(sudo docker network inspect rsl-hermes-api --format '{{(index .IPAM.Config 0).Gateway}}')
if [ ! -f /opt/hermes/config.yaml ]; then
  cat > /opt/hermes/config.yaml <<YAML
dashboard:
  public_url: "https://agent.slwithmj.store"
  trusted_proxies:
    - "${gateway}/32"
YAML
else
  python3 - "$gateway" <<'PY'
import sys
from pathlib import Path
gateway = f"{sys.argv[1]}/32"
path = Path("/opt/hermes/config.yaml")
lines = path.read_text().splitlines()
output = []
in_proxies = False
replaced = False
for line in lines:
    if line.strip() == "trusted_proxies:":
        in_proxies = True
        output.append(line)
        continue
    if in_proxies and line.strip().startswith("- "):
        if not replaced:
            indent = line[:len(line) - len(line.lstrip())]
            output.append(f'{indent}- "{gateway}"')
            replaced = True
        continue
    if in_proxies:
        in_proxies = False
    output.append(line)
if not replaced:
    raise SystemExit("config.yaml 中没有 trusted_proxies")
path.write_text("\n".join(output) + "\n")
PY
fi

if ! grep -q '^skills:' /opt/hermes/config.yaml; then
  cat >> /opt/hermes/config.yaml <<'YAML'
skills:
  auto_load:
    - ledger
YAML
fi

sudo chown -R 10000:10000 /opt/hermes
sudo find /opt/hermes/secrets -type f -exec chmod 600 {} \;
sudo find /opt/hermes/skills -type f -name '*.py' -exec chmod 755 {} \;

sudo docker compose -f /opt/rsl/deploy/docker-compose.hermes.yml pull
sudo docker compose -f /opt/rsl/deploy/docker-compose.hermes.yml up -d --force-recreate

if [ -f /etc/letsencrypt/live/agent.slwithmj.store/fullchain.pem ]; then
  sudo cp /opt/rsl/deploy/nginx/agent.conf /etc/nginx/sites-available/agent.conf
  sudo ln -sfn /etc/nginx/sites-available/agent.conf /etc/nginx/sites-enabled/agent.conf
  sudo nginx -t
  sudo systemctl reload nginx
fi
EOF

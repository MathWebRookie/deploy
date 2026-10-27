#!/bin/bash
set -euo pipefail

DIR=/var/lib/acme-manual
mkdir -p "$DIR"
printf "%s" "$CERTBOT_VALIDATION" > "$DIR/$CERTBOT_DOMAIN"
printf "%s %s\n" "$CERTBOT_DOMAIN" "$CERTBOT_VALIDATION" >> "$DIR/needed.log"
chmod 644 "$DIR/$CERTBOT_DOMAIN" "$DIR/needed.log"

if [ "${CERTBOT_REMAINING_CHALLENGES:-0}" != "0" ]; then
  exit 0
fi

python3 - <<'PY'
import datetime
import os
import subprocess
import time

records = []
with open("/var/lib/acme-manual/needed.log", encoding="utf-8") as handle:
    for line in handle:
        domain, value = line.split(None, 1)
        records.append((domain.strip(), value.strip()))

not_before = datetime.datetime(2026, 10, 27, 7, 22, tzinfo=datetime.timezone.utc)
deadline = time.time() + 40 * 60

def visible(domain, value):
    name = "_acme-challenge." + domain
    out = subprocess.run(
        ["dig", "+short", "TXT", name, "@algol.dnspod.net"],
        capture_output=True,
        text=True,
        timeout=20,
        check=False,
    )
    return value in out.stdout.replace('"', "")

while time.time() < deadline:
    now = datetime.datetime.now(datetime.timezone.utc)
    if now >= not_before and all(visible(domain, value) for domain, value in records):
        time.sleep(20)
        raise SystemExit(0)
    time.sleep(15)

missing = [domain for domain, value in records if not visible(domain, value)]
raise SystemExit("TXT was not visible in time: " + ", ".join(missing))
PY

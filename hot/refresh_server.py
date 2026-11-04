#!/usr/bin/env python3
"""Localhost-only trigger for an immediate hot-list fetch."""

import json
import os
import subprocess
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

INTERVAL_SECONDS = 60
SOURCE_INTERVAL_SECONDS = 15
SOURCES = {"zhihu", "weibo", "bilibili", "ithome", "juejin", "baidu"}
FETCH = os.environ.get("HOT_FETCH", "/opt/rsl/deploy/hot/fetch.py")
HOST = "127.0.0.1"
PORT = 8765
last_started = {}


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/refresh":
            self.respond(404, {"status": "missing"})
            return
        source = (urllib.parse.parse_qs(parsed.query).get("source") or [""])[0]
        if source and source not in SOURCES:
            self.respond(400, {"status": "bad-source"})
            return
        key = source or "*"
        now = time.time()
        interval = SOURCE_INTERVAL_SECONDS if source else INTERVAL_SECONDS
        if now - last_started.get(key, 0) < interval:
            self.respond(429, {"status": "limited"})
            return
        last_started[key] = now
        command = ["/usr/bin/python3", FETCH, "--try"]
        if source:
            command.extend(["--source", source])
        try:
            completed = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=90,
                env=os.environ.copy(),
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            print(f"refresh failed {exc}", flush=True)
            self.respond(500, {"status": "error"})
            return
        if completed.returncode == 2:
            last_started[key] = 0
            self.respond(200, {"status": "busy"})
            return
        if completed.returncode != 0:
            print(completed.stdout, completed.stderr, flush=True)
            self.respond(500, {"status": "error"})
            return
        self.respond(200, {"status": "ok"})

    def respond(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(fmt % args, flush=True)


def main():
    if not Path(FETCH).is_file():
        raise SystemExit(f"missing fetch script {FETCH}")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"listening on {HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
